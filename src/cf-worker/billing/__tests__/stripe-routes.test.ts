import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, LogLevel, Logger } from "effect";
import type StripeSdk from "stripe";

import { AuthClient } from "../../auth/service";
import { DbClient } from "../../db/service";
import type { Env } from "../../shared";
import { StripeApiError, WebhookVerificationError } from "../errors";
import { checkoutProgram } from "../routes/checkout";
import { successProgram } from "../routes/success";
import { webhookProgram } from "../routes/webhook";
import { StripeClient } from "../stripe-client";
import type { StripeClientShape } from "../stripe-client";

const ENV = { PUBLIC_URL: "https://app.test" } as unknown as Env;
const ORG_UUID = "11111111-1111-4111-8111-111111111111";

const quiet = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Logger.withMinimumLogLevel(LogLevel.None));

const run = <R>(
  program: Effect.Effect<Response, never, R>,
  layer: Layer.Layer<R>
) => Effect.runPromise(quiet(program.pipe(Effect.provide(layer))));

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
  } as unknown as AuthClient["Type"]);

const loggedIn: Session = {
  user: { id: "22222222-2222-4222-8222-222222222222" },
  session: { activeOrganizationId: ORG_UUID },
};

// One org row shaped as a superset so it satisfies every billing lookup
// (by-id for customer, by-customer for sync).
const orgDb = (
  org: Record<string, unknown> | undefined,
  updates: Record<string, unknown>[] = []
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

  it("returns 400 when the stripe-signature header is missing", async () => {
    const res = await run(
      webhookProgram(post()),
      Layer.mergeAll(stripeStub({}), orgDb(undefined))
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when signature verification fails", async () => {
    const res = await run(
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
  });

  it("acknowledges events with no customer without syncing", async () => {
    let listed = false;
    const res = await run(
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
    expect(await res.json()).toEqual({ received: true });
    expect(listed).toBe(false);
  });

  it("acks an irrelevant event without syncing", async () => {
    let listed = false;
    const res = await run(
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
    expect(await res.json()).toEqual({ received: true });
    expect(listed).toBe(false);
  });

  it("syncs and acknowledges an event carrying a customer", async () => {
    const updates: Record<string, unknown>[] = [];
    const res = await run(
      webhookProgram(post({ "stripe-signature": "sig" })),
      Layer.mergeAll(
        stripeStub({
          constructWebhookEvent: () => Effect.succeed(stripeEvent("cus_1")),
          listSubscriptions: () => Effect.succeed([]),
        }),
        orgDb({ id: ORG_UUID, tier: "pro", tierSource: "stripe" }, updates)
      )
    );
    expect(res.status).toBe(200);
    // No active sub → downgrade applied.
    expect(updates[0]?.tier).toBe("free");
  });

  it("returns 500 so Stripe retries when the sync write fails", async () => {
    const res = await run(
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
  });
});

describe("checkoutProgram", () => {
  const post = (tier: string) =>
    new Request("https://app.test/api/stripe/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tier }),
    });

  it("returns 401 when not authenticated", async () => {
    const res = await run(
      checkoutProgram(post("pro"), ENV),
      Layer.mergeAll(stripeStub({}), authStub(null), orgDb(undefined))
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when there is no active organization", async () => {
    const res = await run(
      checkoutProgram(post("pro"), ENV),
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
  });

  it("returns 500 when the tier has no configured price", async () => {
    const res = await run(
      checkoutProgram(post("pro"), ENV),
      Layer.mergeAll(
        stripeStub({ priceForTier: () => null }),
        authStub(loggedIn),
        orgDb({
          id: ORG_UUID,
          name: "Acme",
          stripeCustomerId: "cus_1",
          members: [],
        })
      )
    );
    expect(res.status).toBe(500);
  });

  it("returns the checkout url on the happy path", async () => {
    const res = await run(
      checkoutProgram(post("pro"), ENV),
      Layer.mergeAll(
        stripeStub({
          priceForTier: () => "price_pro" as never,
          createCheckoutSession: () =>
            Effect.succeed({ url: "https://checkout.test/s" } as never),
        }),
        authStub(loggedIn),
        orgDb({
          id: ORG_UUID,
          name: "Acme",
          stripeCustomerId: "cus_1",
          members: [],
        })
      )
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.test/s" });
  });
});

describe("successProgram", () => {
  const get = () =>
    new Request("https://app.test/api/stripe/success?session_id=cs_1");

  it("redirects to /welcome after syncing", async () => {
    const updates: Record<string, unknown>[] = [];
    const res = await run(
      successProgram(get(), ENV),
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
      )
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://app.test/welcome");
  });

  it("still redirects when there is no Stripe customer yet", async () => {
    const res = await run(
      successProgram(get(), ENV),
      Layer.mergeAll(
        stripeStub({}),
        authStub(loggedIn),
        orgDb({ id: ORG_UUID, stripeCustomerId: null })
      )
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://app.test/welcome");
  });

  it("redirects to /welcome (not JSON) when the session is gone", async () => {
    const res = await run(
      successProgram(get(), ENV),
      Layer.mergeAll(stripeStub({}), authStub(null), orgDb(undefined))
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://app.test/welcome");
  });

  it("redirects even when the sync fails (webhook backstops)", async () => {
    const res = await run(
      successProgram(get(), ENV),
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
  });
});
