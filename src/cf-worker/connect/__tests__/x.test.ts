import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { describe, expect, vi } from "vitest";

import type { TierCapabilities } from "@/lib/plan";
import { capabilitiesFor } from "@/lib/plan";

import { AuthClient } from "../../auth/service";
import { Billing } from "../../billing/service";
import { OrgId, UserId } from "../../db/branded";
import type { Env } from "../../shared";
import { SessionProvider } from "../services";
import { xDisconnectRequest, xResumeRequest } from "../x";

const USER = UserId.make("user-1");
const ORG = OrgId.make("org-1");

const sessionStub = (
  session: { userId: UserId; orgId: OrgId | null } | null = {
    userId: USER,
    orgId: ORG,
  }
) =>
  Layer.succeed(SessionProvider, {
    getSession: () => Effect.succeed(session),
  });

const billingStub = (caps: TierCapabilities) => {
  const notImpl = <A>(): Effect.Effect<A> =>
    Effect.die("Billing stub method not implemented in test");
  return Layer.succeed(
    Billing,
    Billing.of({
      capabilities: () => Effect.succeed(caps),
      tier: notImpl,
      subscription: notImpl,
      getOverrides: notImpl,
      setTier: notImpl,
      setOverride: notImpl,
      exists: notImpl,
      listWithOwners: notImpl,
    })
  );
};

// For gate-denial tests where the DO call never fires the env never gets
// touched, so an empty object cast is safe. The pro-allowed tests use the
// `xDoStubEnv` factory below which builds a minimal stub.
const denialEnv = {} as Env;

const xDoStubEnv = (status: { connected: boolean }, calls: string[]): Env => {
  const stub = {
    status: () => {
      calls.push("status");
      return Promise.resolve(status);
    },
    resume: () => {
      calls.push("resume");
      return Promise.resolve(undefined);
    },
    disconnect: () => {
      calls.push("disconnect");
      return Promise.resolve(undefined);
    },
  };
  return {
    X_BOOKMARK_SYNC_DO: {
      idFromName: () => "do-id",
      get: () => stub,
    },
  } as unknown as Env;
};

const newRequest = () =>
  new Request("http://worker/api/connect/x/resume", { method: "POST" });

const authLayer = (api: {
  listUserAccounts: ReturnType<typeof vi.fn>;
  unlinkAccount: ReturnType<typeof vi.fn>;
}) =>
  Layer.succeed(AuthClient, {
    api,
  } as unknown as AuthClient["Service"]);

describe("xResumeRequest gate", () => {
  it.effect(
    "free tier → fails CapabilityDisabledError with requiredTier 'pro'",
    () =>
      xResumeRequest(newRequest(), denialEnv).pipe(
        Effect.provide(
          Layer.mergeAll(sessionStub(), billingStub(capabilitiesFor("free")))
        ),
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error._tag).toBe("CapabilityDisabledError");
            if (error._tag === "CapabilityDisabledError") {
              expect(error.capability).toBe("xBookmarkSync");
              expect(error.requiredTier).toBe("pro");
            }
          })
        )
      )
  );

  it.effect(
    "plus tier → fails CapabilityDisabledError (xBookmarkSync is pro-only)",
    () =>
      xResumeRequest(newRequest(), denialEnv).pipe(
        Effect.provide(
          Layer.mergeAll(sessionStub(), billingStub(capabilitiesFor("plus")))
        ),
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error._tag).toBe("CapabilityDisabledError");
            if (error._tag === "CapabilityDisabledError") {
              expect(error.capability).toBe("xBookmarkSync");
              expect(error.requiredTier).toBe("pro");
            }
          })
        )
      )
  );

  it.effect(
    "pro tier with status.connected=true → resumes successfully",
    () => {
      const calls: string[] = [];
      const env = xDoStubEnv({ connected: true }, calls);
      return xResumeRequest(newRequest(), env).pipe(
        Effect.provide(
          Layer.mergeAll(sessionStub(), billingStub(capabilitiesFor("pro")))
        ),
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(result).toEqual({ ok: true });
            // Status check then resume — gate passed through to the DO calls.
            expect(calls).toEqual(["status", "resume"]);
          })
        )
      );
    }
  );

  it.effect(
    "pro tier with status.connected=false → returns not_connected without resuming",
    () => {
      const calls: string[] = [];
      const env = xDoStubEnv({ connected: false }, calls);
      return xResumeRequest(newRequest(), env).pipe(
        Effect.provide(
          Layer.mergeAll(sessionStub(), billingStub(capabilitiesFor("pro")))
        ),
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(result).toEqual({ kind: "not_connected" });
            expect(calls).toEqual(["status"]);
          })
        )
      );
    }
  );

  it.effect("no active org → fails NoActiveOrgError", () =>
    xResumeRequest(newRequest(), denialEnv).pipe(
      Effect.provide(
        Layer.mergeAll(
          sessionStub({ userId: USER, orgId: null }),
          billingStub(capabilitiesFor("pro"))
        )
      ),
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("NoActiveOrgError");
        })
      )
    )
  );

  it.effect("no session → fails ConnectUnauthorizedError", () =>
    xResumeRequest(newRequest(), denialEnv).pipe(
      Effect.provide(
        Layer.mergeAll(sessionStub(null), billingStub(capabilitiesFor("pro")))
      ),
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("ConnectUnauthorizedError");
        })
      )
    )
  );
});

describe("xDisconnectRequest", () => {
  it.effect("unlinks the local Better Auth row for the X account", () => {
    const calls: string[] = [];
    const env = xDoStubEnv({ connected: true }, calls);
    const listUserAccounts = vi.fn(() =>
      Promise.resolve([
        {
          accountId: "external-google-subject",
          id: "local-google-row",
          providerId: "google",
        },
        {
          accountId: "external-x-subject",
          id: "local-x-row",
          providerId: "x",
        },
      ])
    );
    const unlinkAccount = vi.fn(() => Promise.resolve({ status: true }));

    return xDisconnectRequest(newRequest(), env).pipe(
      Effect.provide(
        Layer.mergeAll(
          sessionStub(),
          authLayer({ listUserAccounts, unlinkAccount })
        )
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({ ok: true });
          expect(calls).toEqual(["disconnect"]);
          expect(unlinkAccount).toHaveBeenCalledWith(
            expect.objectContaining({
              body: { accountId: "local-x-row" },
            })
          );
        })
      )
    );
  });

  it.effect("treats a missing X account as already unlinked", () => {
    const calls: string[] = [];
    const env = xDoStubEnv({ connected: true }, calls);
    const listUserAccounts = vi.fn(() =>
      Promise.resolve([
        {
          accountId: "external-google-subject",
          id: "local-google-row",
          providerId: "google",
        },
      ])
    );
    const unlinkAccount = vi.fn(() => Promise.resolve({ status: true }));

    return xDisconnectRequest(newRequest(), env).pipe(
      Effect.provide(
        Layer.mergeAll(
          sessionStub(),
          authLayer({ listUserAccounts, unlinkAccount })
        )
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({ ok: true });
          expect(calls).toEqual(["disconnect"]);
          expect(unlinkAccount).not.toHaveBeenCalled();
        })
      )
    );
  });
});
