import { assert, describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Ref, References } from "effect";
import type StripeSdk from "stripe";

import { AuthClient } from "../../auth/service";
import { OrgId, UserId } from "../../db/branded";
import { DbClient } from "../../db/service";
import {
  DigestScheduleReconcileError,
  DigestScheduleReconciler,
} from "../../weekly-digest/reconcile";
import {
  XReconcileQueue,
  XReconcileQueueError,
} from "../../x-sync/reconcile-queue";
import type { XReconcileMessage } from "../../x-sync/reconcile-queue";
import { StripeApiError, WebhookVerificationError } from "../errors";
import { checkoutProgram } from "../routes/checkout";
import { successProgram } from "../routes/success";
import { webhookProgram } from "../routes/webhook";
import { StripeClient } from "../stripe-client";
import type { StripeClientShape } from "../stripe-client";

const WELCOME_URL = "https://app.test/welcome";
const BASE_URL = "https://app.test";
const ORG_UUID = "11111111-1111-4111-8111-111111111111";

const quiet = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(References.MinimumLogLevel, "None"));

const reconcileQueueLayer = Layer.succeed(
  XReconcileQueue,
  XReconcileQueue.of({ send: () => Effect.void })
);

const digestScheduleLayer = Layer.succeed(DigestScheduleReconciler, {
  reconcile: () => Effect.void,
});

const run = <R>(
  program: Effect.Effect<
    Response,
    never,
    DigestScheduleReconciler | R | XReconcileQueue
  >,
  layer: Layer.Layer<R>,
  queue: Layer.Layer<XReconcileQueue> = reconcileQueueLayer,
  digest: Layer.Layer<DigestScheduleReconciler> = digestScheduleLayer
) => quiet(program.pipe(Effect.provide(Layer.mergeAll(digest, layer, queue))));

const recordingQueue = Effect.fnUntraced(function* () {
  const messages = yield* Ref.make<ReadonlyArray<XReconcileMessage>>([]);
  const layer = Layer.succeed(
    XReconcileQueue,
    XReconcileQueue.of({
      send: (message) =>
        Ref.update(messages, (current) => [...current, message]),
    })
  );
  return { layer, messages };
});

const recordingDigestSchedule = Effect.fnUntraced(function* () {
  const orgIds = yield* Ref.make<ReadonlyArray<OrgId>>([]);
  const layer = Layer.succeed(DigestScheduleReconciler, {
    reconcile: (orgId) => Ref.update(orgIds, (current) => [...current, orgId]),
  });
  return { layer, orgIds };
});

const failingDigestSchedule = (orgId: OrgId) =>
  Layer.succeed(DigestScheduleReconciler, {
    reconcile: () =>
      Effect.fail(
        new DigestScheduleReconcileError({
          cause: new Error("digest owner unavailable"),
          orgId,
        })
      ),
  });

const notImpl = (): Effect.Effect<never> =>
  Effect.die("StripeClient method not stubbed in test");

const stripeStub = (overrides: Partial<StripeClientShape>) =>
  Layer.succeed(StripeClient, {
    createCustomer: notImpl,
    createCheckoutSession: notImpl,
    createPortalSession: notImpl,
    listSubscriptions: () => Effect.succeed([]),
    constructWebhookEvent: notImpl,
    tierForPrice: () => null,
    priceForTier: () => null,
    ...overrides,
  } as unknown as StripeClientShape);

type Session = {
  user: { id: string };
  session: { activeOrganizationId: string | null };
} | null;

const authStub = (session: Session) =>
  Layer.succeed(AuthClient, {
    api: { getSession: () => Promise.resolve(session) },
  } as unknown as AuthClient["Service"]);

const loggedIn: Session = {
  user: { id: "22222222-2222-4222-8222-222222222222" },
  session: { activeOrganizationId: ORG_UUID },
};

// One org row shaped as a superset so it satisfies every billing lookup
// (by-id for customer, by-customer for sync).
const orgDb = (
  org: Record<string, unknown> | undefined,
  updates: Record<string, unknown>[] = [],
  linkedUsers: ReadonlyArray<string> = []
) =>
  Layer.succeed(DbClient, {
    query: { organization: { findFirst: () => Promise.resolve(org) } },
    update: () => ({
      set: (vals: Record<string, unknown>) => ({
        where: () => {
          updates.push(vals);
          return Promise.resolve(undefined);
        },
      }),
    }),
    selectDistinct: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () =>
            Promise.resolve(linkedUsers.map((userId) => ({ userId }))),
        }),
      }),
    }),
  } as never);

const stripeEvent = (
  customer?: unknown,
  type = "customer.subscription.updated"
): StripeSdk.Event =>
  ({
    type,
    data: { object: customer === undefined ? {} : { customer } },
  }) as unknown as StripeSdk.Event;

describe("webhookProgram", () => {
  const post = (headers: Record<string, string> = {}) =>
    new Request("https://app.test/api/stripe/webhook", {
      method: "POST",
      headers,
      body: "raw-payload",
    });

  it.effect("returns 400 when the stripe-signature header is missing", () =>
    Effect.gen(function* () {
      const res = yield* run(
        webhookProgram(post()),
        Layer.mergeAll(stripeStub({}), orgDb(undefined))
      );
      expect(res.status).toBe(400);
    })
  );

  it.effect("returns 400 when signature verification fails", () =>
    Effect.gen(function* () {
      const res = yield* run(
        webhookProgram(post({ "stripe-signature": "bad" })),
        Layer.mergeAll(
          stripeStub({
            constructWebhookEvent: () =>
              Effect.fail(new WebhookVerificationError({ message: "nope" })),
          }),
          orgDb(undefined)
        )
      );
      expect(res.status).toBe(400);
    })
  );

  it.effect("acknowledges events with no customer without syncing", () =>
    Effect.gen(function* () {
      let listed = false;
      const res = yield* run(
        webhookProgram(post({ "stripe-signature": "sig" })),
        Layer.mergeAll(
          stripeStub({
            constructWebhookEvent: () => Effect.succeed(stripeEvent()),
            listSubscriptions: () => {
              listed = true;
              return Effect.succeed([]);
            },
          }),
          orgDb(undefined)
        )
      );
      expect(res.status).toBe(200);
      expect(yield* Effect.promise(() => res.json())).toEqual({
        received: true,
      });
      expect(listed).toBe(false);
    })
  );

  it.effect("acks an irrelevant event without syncing", () =>
    Effect.gen(function* () {
      let listed = false;
      const res = yield* run(
        webhookProgram(post({ "stripe-signature": "sig" })),
        Layer.mergeAll(
          stripeStub({
            constructWebhookEvent: () =>
              Effect.succeed(
                stripeEvent("cus_1", "billing_portal.session.created")
              ),
            listSubscriptions: () => {
              listed = true;
              return Effect.succeed([]);
            },
          }),
          orgDb({ id: ORG_UUID, tier: "pro", tierSource: "stripe" })
        )
      );
      expect(res.status).toBe(200);
      expect(yield* Effect.promise(() => res.json())).toEqual({
        received: true,
      });
      expect(listed).toBe(false);
    })
  );

  it.effect("syncs, enqueues X reconciliation, and acknowledges", () =>
    Effect.gen(function* () {
      const updates: Record<string, unknown>[] = [];
      const queue = yield* recordingQueue();
      const digest = yield* recordingDigestSchedule();
      const userId = UserId.make("x-linked-user");
      const res = yield* run(
        webhookProgram(post({ "stripe-signature": "sig" })),
        Layer.mergeAll(
          stripeStub({
            constructWebhookEvent: () => Effect.succeed(stripeEvent("cus_1")),
            listSubscriptions: () => Effect.succeed([]),
          }),
          orgDb({ id: ORG_UUID, tier: "pro", tierSource: "stripe" }, updates, [
            userId,
          ])
        ),
        queue.layer,
        digest.layer
      );
      expect(res.status).toBe(200);
      expect(updates[0]?.tier).toBe("free");
      assert.deepStrictEqual(yield* Ref.get(queue.messages), [
        {
          userId,
          orgId: OrgId.make(ORG_UUID),
          wakeForEntitlementChange: true,
        },
      ]);
      assert.deepStrictEqual(yield* Ref.get(digest.orgIds), [
        OrgId.make(ORG_UUID),
      ]);
    })
  );

  it.effect("returns 500 so Stripe retries when the sync write fails", () =>
    Effect.gen(function* () {
      const res = yield* run(
        webhookProgram(post({ "stripe-signature": "sig" })),
        Layer.mergeAll(
          stripeStub({
            constructWebhookEvent: () => Effect.succeed(stripeEvent("cus_1")),
          }),
          Layer.succeed(DbClient, {
            query: {
              organization: {
                findFirst: () => Promise.reject(new Error("D1 down")),
              },
            },
          } as never)
        )
      );
      expect(res.status).toBe(500);
    })
  );

  it.effect(
    "returns 500 so Stripe retries when reconciliation cannot enqueue",
    () =>
      Effect.gen(function* () {
        const userId = UserId.make("x-linked-user");
        const orgId = OrgId.make(ORG_UUID);
        const failedQueue = Layer.succeed(
          XReconcileQueue,
          XReconcileQueue.of({
            send: (message) =>
              Effect.fail(
                new XReconcileQueueError({
                  message: "queue unavailable",
                  userId: message.userId,
                  orgId: message.orgId,
                  cause: new Error("queue unavailable"),
                })
              ),
          })
        );
        const res = yield* run(
          webhookProgram(post({ "stripe-signature": "sig" })),
          Layer.mergeAll(
            stripeStub({
              constructWebhookEvent: () => Effect.succeed(stripeEvent("cus_1")),
              listSubscriptions: () => Effect.succeed([]),
            }),
            orgDb(
              { id: orgId, tier: "pro", tierSource: "stripe" },
              [],
              [userId]
            )
          ),
          failedQueue
        );
        expect(res.status).toBe(500);
      })
  );

  it.effect("returns 500 so Stripe retries when digest wake fails", () =>
    Effect.gen(function* () {
      const orgId = OrgId.make(ORG_UUID);
      const res = yield* run(
        webhookProgram(post({ "stripe-signature": "sig" })),
        Layer.mergeAll(
          stripeStub({
            constructWebhookEvent: () => Effect.succeed(stripeEvent("cus_1")),
            listSubscriptions: () => Effect.succeed([]),
          }),
          orgDb({ id: orgId, tier: "pro", tierSource: "stripe" })
        ),
        reconcileQueueLayer,
        failingDigestSchedule(orgId)
      );
      expect(res.status).toBe(500);
    })
  );
});

describe("checkoutProgram", () => {
  const post = (tier: string, interval = "month") =>
    new Request("https://app.test/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier, interval }),
    });

  const postRaw = (body: Record<string, unknown>) =>
    new Request("https://app.test/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const customerOrg = {
    id: ORG_UUID,
    name: "Acme",
    stripeCustomerId: "cus_1",
    members: [],
  };

  it.effect("returns 401 when not authenticated", () =>
    Effect.gen(function* () {
      const res = yield* run(
        checkoutProgram(post("pro"), BASE_URL),
        Layer.mergeAll(stripeStub({}), authStub(null), orgDb(undefined))
      );
      expect(res.status).toBe(401);
    })
  );

  it.effect("returns 400 when there is no active organization", () =>
    Effect.gen(function* () {
      const res = yield* run(
        checkoutProgram(post("pro"), BASE_URL),
        Layer.mergeAll(
          stripeStub({}),
          authStub({
            user: { id: ORG_UUID },
            session: { activeOrganizationId: null },
          }),
          orgDb(undefined)
        )
      );
      expect(res.status).toBe(400);
    })
  );

  it.effect("returns 400 for an unknown interval", () =>
    Effect.gen(function* () {
      const res = yield* run(
        checkoutProgram(postRaw({ tier: "pro", interval: "weekly" }), BASE_URL),
        Layer.mergeAll(stripeStub({}), authStub(loggedIn), orgDb(customerOrg))
      );
      expect(res.status).toBe(400);
    })
  );

  it.effect("returns 400 for an unknown tier", () =>
    Effect.gen(function* () {
      const res = yield* run(
        checkoutProgram(
          postRaw({ tier: "enterprise", interval: "month" }),
          BASE_URL
        ),
        Layer.mergeAll(stripeStub({}), authStub(loggedIn), orgDb(customerOrg))
      );
      expect(res.status).toBe(400);
    })
  );

  it.effect("returns 400 when the interval is missing", () =>
    Effect.gen(function* () {
      const res = yield* run(
        checkoutProgram(postRaw({ tier: "pro" }), BASE_URL),
        Layer.mergeAll(stripeStub({}), authStub(loggedIn), orgDb(customerOrg))
      );
      expect(res.status).toBe(400);
    })
  );

  it.effect("returns 500 when the tier has no configured price", () =>
    Effect.gen(function* () {
      const res = yield* run(
        checkoutProgram(post("pro"), BASE_URL),
        Layer.mergeAll(
          stripeStub({ priceForTier: () => null }),
          authStub(loggedIn),
          orgDb(customerOrg)
        )
      );
      expect(res.status).toBe(500);
    })
  );

  it.effect("returns the checkout url on the happy path", () =>
    Effect.gen(function* () {
      const res = yield* run(
        checkoutProgram(post("pro"), BASE_URL),
        Layer.mergeAll(
          stripeStub({
            priceForTier: () => "price_pro" as never,
            createCheckoutSession: () =>
              Effect.succeed({
                id: "cs_test_1",
                url: "https://checkout.test/s",
              } as never),
          }),
          authStub(loggedIn),
          orgDb(customerOrg)
        )
      );
      expect(res.status).toBe(200);
      expect(yield* Effect.promise(() => res.json())).toEqual({
        url: "https://checkout.test/s",
      });
    })
  );

  it.effect("passes the chosen interval through to the price lookup", () =>
    Effect.gen(function* () {
      let seenInterval: string | undefined;
      const res = yield* run(
        checkoutProgram(post("pro", "year"), BASE_URL),
        Layer.mergeAll(
          stripeStub({
            priceForTier: (_tier, interval) => {
              seenInterval = interval;
              return "price_pro_yearly" as never;
            },
            createCheckoutSession: () =>
              Effect.succeed({
                id: "cs_test_2",
                url: "https://checkout.test/y",
              } as never),
          }),
          authStub(loggedIn),
          orgDb(customerOrg)
        )
      );
      expect(res.status).toBe(200);
      expect(seenInterval).toBe("year");
    })
  );
});

describe("successProgram", () => {
  const get = () =>
    new Request("https://app.test/api/stripe/success?session_id=cs_1");

  it.effect("redirects to /welcome after syncing", () =>
    Effect.gen(function* () {
      const updates: Record<string, unknown>[] = [];
      const digest = yield* recordingDigestSchedule();
      const res = yield* run(
        successProgram(get(), WELCOME_URL),
        Layer.mergeAll(
          stripeStub({ listSubscriptions: () => Effect.succeed([]) }),
          authStub(loggedIn),
          orgDb(
            {
              id: ORG_UUID,
              tier: "pro",
              tierSource: "stripe",
              stripeCustomerId: "cus_1",
            },
            updates
          )
        ),
        reconcileQueueLayer,
        digest.layer
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("https://app.test/welcome");
      assert.deepStrictEqual(yield* Ref.get(digest.orgIds), [
        OrgId.make(ORG_UUID),
      ]);
    })
  );

  it.effect("still redirects when there is no Stripe customer yet", () =>
    Effect.gen(function* () {
      const res = yield* run(
        successProgram(get(), WELCOME_URL),
        Layer.mergeAll(
          stripeStub({}),
          authStub(loggedIn),
          orgDb({ id: ORG_UUID, stripeCustomerId: null })
        )
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("https://app.test/welcome");
    })
  );

  it.effect("redirects to /welcome (not JSON) when the session is gone", () =>
    Effect.gen(function* () {
      const res = yield* run(
        successProgram(get(), WELCOME_URL),
        Layer.mergeAll(stripeStub({}), authStub(null), orgDb(undefined))
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("https://app.test/welcome");
    })
  );

  it.effect("redirects even when the sync fails (webhook backstops)", () =>
    Effect.gen(function* () {
      const res = yield* run(
        successProgram(get(), WELCOME_URL),
        Layer.mergeAll(
          stripeStub({
            listSubscriptions: () =>
              Effect.fail(new StripeApiError({ message: "stripe down" })),
          }),
          authStub(loggedIn),
          orgDb({
            id: ORG_UUID,
            tier: "pro",
            tierSource: "stripe",
            stripeCustomerId: "cus_1",
          })
        )
      );
      expect(res.status).toBe(302);
    })
  );

  it.effect("still redirects when digest wake fails (webhook backstops)", () =>
    Effect.gen(function* () {
      const orgId = OrgId.make(ORG_UUID);
      const res = yield* run(
        successProgram(get(), WELCOME_URL),
        Layer.mergeAll(
          stripeStub({ listSubscriptions: () => Effect.succeed([]) }),
          authStub(loggedIn),
          orgDb({
            id: orgId,
            tier: "pro",
            tierSource: "stripe",
            stripeCustomerId: "cus_1",
          })
        ),
        reconcileQueueLayer,
        failingDigestSchedule(orgId)
      );
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("https://app.test/welcome");
    })
  );
});
