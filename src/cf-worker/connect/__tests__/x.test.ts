import { assert, it } from "@effect/vitest";
import { Effect, Layer, Ref } from "effect";
import { describe } from "vitest";

import type { TierCapabilities } from "@/lib/plan";
import { capabilitiesFor } from "@/lib/plan";

import { Billing } from "../../billing/service";
import { OrgId, UserId } from "../../db/branded";
import { XSyncSideEffectError } from "../../x-sync/errors";
import { XSyncControl } from "../../x-sync/services/x-sync-control";
import { SessionProvider } from "../services";
import { xCompleteRequest, xPauseRequest, xResumeRequest } from "../x";

const USER = UserId.make("user-1");
const ORG = OrgId.make("org-1");

const sessionLayer = (
  session: { userId: UserId; orgId: OrgId | null } | null = {
    userId: USER,
    orgId: ORG,
  }
) =>
  Layer.succeed(SessionProvider, {
    getSession: () => Effect.succeed(session),
  });

const billingLayer = (capabilities: TierCapabilities) => {
  const notUsed = <A>(): Effect.Effect<A> =>
    Effect.die("Unexpected Billing call");
  return Layer.succeed(
    Billing,
    Billing.of({
      capabilities: () => Effect.succeed(capabilities),
      assistantAllowance: notUsed,
      tier: notUsed,
      subscription: notUsed,
      getOverrides: notUsed,
      setTier: notUsed,
      setOverride: notUsed,
      exists: notUsed,
      listWithOwners: notUsed,
    })
  );
};

const controlLayer = (overrides: Partial<XSyncControl["Service"]> = {}) => {
  const notUsed = <A>(): Effect.Effect<A> =>
    Effect.die("Unexpected XSyncControl call");
  return Layer.succeed(
    XSyncControl,
    XSyncControl.of({
      disconnect: notUsed,
      pause: notUsed,
      reconcile: notUsed,
      resume: notUsed,
      status: notUsed,
      ...overrides,
    })
  );
};

const request = (path = "/api/connect/x/resume") =>
  new Request(`http://worker${path}`, { method: "POST" });

describe("xResumeRequest", () => {
  it.effect("rejects a plan without X bookmark sync", () =>
    xResumeRequest(request()).pipe(
      Effect.provide(
        Layer.mergeAll(
          sessionLayer(),
          billingLayer(capabilitiesFor("free")),
          controlLayer()
        )
      ),
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          assert.strictEqual(error._tag, "CapabilityDisabledError");
          if (error._tag !== "CapabilityDisabledError") return;
          assert.strictEqual(error.capability, "xBookmarkSync");
          assert.strictEqual(error.requiredTier, "pro");
        })
      )
    )
  );

  it.effect("resumes an entitled connected account", () =>
    Effect.gen(function* () {
      const resumed = yield* Ref.make(false);
      const result = yield* xResumeRequest(request()).pipe(
        Effect.provide(
          Layer.mergeAll(
            sessionLayer(),
            billingLayer(capabilitiesFor("pro")),
            controlLayer({
              status: () => Effect.succeed({ connected: true }),
              resume: () => Ref.set(resumed, true),
            })
          )
        )
      );

      assert.deepStrictEqual(result, { ok: true });
      assert.isTrue(yield* Ref.get(resumed));
    })
  );

  it.effect("does not resume an account without durable state", () =>
    xResumeRequest(request()).pipe(
      Effect.provide(
        Layer.mergeAll(
          sessionLayer(),
          billingLayer(capabilitiesFor("pro")),
          controlLayer({
            status: () => Effect.succeed({ connected: false }),
          })
        )
      ),
      Effect.tap((result) =>
        Effect.sync(() =>
          assert.deepStrictEqual(result, { kind: "not_connected" })
        )
      )
    )
  );
});

describe("X control failures", () => {
  it.effect(
    "keeps a status failure typed instead of reporting disconnected",
    () =>
      xPauseRequest(request("/api/connect/x/pause")).pipe(
        Effect.provide(
          Layer.mergeAll(
            sessionLayer(),
            controlLayer({
              status: () =>
                Effect.fail(
                  new XSyncSideEffectError({
                    op: "DO.status",
                    cause: "unavailable",
                  })
                ),
            })
          )
        ),
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() =>
            assert.strictEqual(error._tag, "XSyncSideEffectError")
          )
        )
      )
  );
});

describe("xCompleteRequest", () => {
  it.effect("reconciles once and redirects with transient UI state", () =>
    Effect.gen(function* () {
      const reconciliations = yield* Ref.make(0);
      const response = yield* xCompleteRequest(
        request(
          "/api/connect/x/complete?returnTo=%2Fsettings%3Ftab%3Dintegration"
        )
      ).pipe(
        Effect.provide(
          Layer.mergeAll(
            sessionLayer(),
            controlLayer({
              reconcile: () =>
                Ref.update(reconciliations, (count) => count + 1).pipe(
                  Effect.as({ kind: "active", organizationId: ORG })
                ),
            })
          )
        )
      );

      assert.strictEqual(response.status, 303);
      assert.strictEqual(
        response.headers.get("location"),
        "http://worker/settings?tab=integration&integrationResult=x-connected"
      );
      assert.strictEqual(yield* Ref.get(reconciliations), 1);
    })
  );

  it.effect("rejects an external return target", () =>
    xCompleteRequest(
      request("/api/connect/x/complete?returnTo=https%3A%2F%2Fevil.example%2F")
    ).pipe(
      Effect.provide(
        Layer.mergeAll(
          sessionLayer(),
          controlLayer({
            reconcile: () =>
              Effect.succeed({ kind: "active", organizationId: ORG }),
          })
        )
      ),
      Effect.tap((response) =>
        Effect.sync(() =>
          assert.strictEqual(
            response.headers.get("location"),
            "http://worker/?integrationResult=x-connected"
          )
        )
      )
    )
  );
});
