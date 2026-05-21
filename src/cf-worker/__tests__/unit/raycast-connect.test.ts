import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, LogLevel, Logger } from "effect";

import type { TierCapabilities } from "@/lib/plan";
import { capabilitiesFor } from "@/lib/plan";

import { Billing } from "../../billing/service";
import { KeyCreationError } from "../../connect/errors";
import {
  handleConnectRequest,
  handleExchangeRequest,
} from "../../connect/raycast";
import {
  ApiKeyStore,
  SessionProvider,
  VerificationStore,
} from "../../connect/services";
import type { SessionData } from "../../connect/services";
import { OrgId, UserId } from "../../db/branded";

function makeSessionLayer(result: SessionData | null) {
  return Layer.succeed(SessionProvider, {
    getSession: () => Effect.succeed(result),
  });
}

function makeApiKeyLayer(overrides: Partial<ApiKeyStore["Type"]> = {}) {
  return Layer.succeed(ApiKeyStore, {
    listByUser: () => Effect.succeed([]),
    deleteById: () => Effect.void,
    create: () => Effect.succeed({ key: "lb_test_key_123", id: "key-id-1" }),
    updateName: () => Effect.void,
    ...overrides,
  });
}

function makeVerificationLayer(
  overrides: Partial<VerificationStore["Type"]> = {}
) {
  return Layer.succeed(VerificationStore, {
    save: () => Effect.void,
    consumeByIdentifier: () => Effect.succeed(null),
    ...overrides,
  });
}

function makeBillingLayer(caps: TierCapabilities = capabilitiesFor("plus")) {
  const notImpl = <A>(): Effect.Effect<A> =>
    Effect.die("Billing stub method not implemented in test");
  return Layer.succeed(
    Billing,
    new Billing({
      capabilities: () => Effect.succeed(caps),
      tier: notImpl,
      getOverrides: notImpl,
      setTier: notImpl,
      setOverride: notImpl,
      exists: notImpl,
      listWithOwners: notImpl,
    })
  );
}

function runConnect(
  options: {
    session?: SessionData | null;
    apiKeyStore?: Partial<ApiKeyStore["Type"]>;
    verificationStore?: Partial<VerificationStore["Type"]>;
    caps?: TierCapabilities;
  } = {}
) {
  const layer = Layer.mergeAll(
    makeSessionLayer(options.session ?? null),
    makeApiKeyLayer(options.apiKeyStore),
    makeVerificationLayer(options.verificationStore),
    makeBillingLayer(options.caps)
  );

  return handleConnectRequest(new Headers()).pipe(
    Effect.provide(layer),
    Logger.withMinimumLogLevel(LogLevel.Error)
  );
}

function runExchange(
  body: { code?: string; deviceName?: string },
  options: {
    apiKeyStore?: Partial<ApiKeyStore["Type"]>;
    verificationStore?: Partial<VerificationStore["Type"]>;
  } = {}
) {
  const layer = Layer.mergeAll(
    makeSessionLayer(null),
    makeApiKeyLayer(options.apiKeyStore),
    makeVerificationLayer(options.verificationStore),
    makeBillingLayer()
  );

  return handleExchangeRequest(body).pipe(
    Effect.provide(layer),
    Logger.withMinimumLogLevel(LogLevel.Error)
  );
}

describe("handleConnectRequest", () => {
  it.effect("fails with ConnectUnauthorizedError when session is null", () =>
    runConnect({ session: null }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("ConnectUnauthorizedError");
        })
      )
    )
  );

  it.effect("fails with NoActiveOrgError when orgId is null", () =>
    runConnect({
      session: { userId: UserId.make("user-1"), orgId: null },
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("NoActiveOrgError");
        })
      )
    )
  );

  it.effect(
    "fails with CapabilityDisabledError when org is on the free tier (no integrations)",
    () =>
      runConnect({
        session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
        caps: capabilitiesFor("free"),
      }).pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error._tag).toBe("CapabilityDisabledError");
            if (error._tag === "CapabilityDisabledError") {
              expect(error.capability).toBe("integrations");
              expect(error.requiredTier).toBe("plus");
            }
          })
        )
      )
  );

  it.effect("propagates KeyCreationError from create", () =>
    runConnect({
      session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
      apiKeyStore: {
        create: () =>
          Effect.fail(
            new KeyCreationError({ cause: new Error("createApiKey threw") })
          ),
      },
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("KeyCreationError");
        })
      )
    )
  );

  it.effect("returns code on success", () =>
    runConnect({
      session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
    }).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toHaveProperty("code");
          expect(typeof result.code).toBe("string");
        })
      )
    )
  );

  it.effect("passes correct metadata to create", () => {
    let capturedMetadata: unknown = null;
    let capturedName: unknown = null;

    return runConnect({
      session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
      apiKeyStore: {
        create: (_headers, metadata, name) => {
          capturedMetadata = metadata;
          capturedName = name;
          return Effect.succeed({ key: "lb_key", id: "key-id" });
        },
      },
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(capturedMetadata).toEqual({
            orgId: "org-1",
            source: "raycast",
          });
          expect(capturedName).toBe("Raycast Extension");
        })
      )
    );
  });

  it.effect("saves verification with key and keyId as JSON", () => {
    let capturedIdentifier: string | null = null;
    let capturedData: unknown = null;

    return runConnect({
      session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
      verificationStore: {
        save: (identifier, data) => {
          capturedIdentifier = identifier;
          capturedData = data;
          return Effect.void;
        },
      },
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(capturedIdentifier).toMatch(/^raycast-connect:/);
          expect(capturedData).toEqual({
            key: "lb_test_key_123",
            keyId: "key-id-1",
          });
        })
      )
    );
  });
});

describe("handleExchangeRequest", () => {
  it.effect("fails with MissingCodeError when code is missing", () =>
    runExchange({}).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("MissingCodeError");
        })
      )
    )
  );

  it.effect(
    "fails with InvalidCodeError when verification record not found",
    () =>
      runExchange({ code: "bad-code" }).pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error._tag).toBe("InvalidCodeError");
          })
        )
      )
  );

  it.effect("returns apiKey and consumes verification on success", () => {
    let consumedIdentifier: string | null = null;
    const storedData = {
      key: "lb_test_key_123",
      keyId: "key-id-1",
    };

    return runExchange(
      { code: "valid-code" },
      {
        verificationStore: {
          consumeByIdentifier: (identifier) => {
            consumedIdentifier = identifier;
            return identifier === "raycast-connect:valid-code"
              ? Effect.succeed({ id: "ver-1", data: storedData })
              : Effect.succeed(null);
          },
        },
      }
    ).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({ apiKey: "lb_test_key_123" });
          expect(consumedIdentifier).toBe("raycast-connect:valid-code");
        })
      )
    );
  });

  it.effect(
    "second concurrent exchange of the same code yields InvalidCodeError",
    () => {
      // Models the race-lost path: the first concurrent caller wins the
      // DELETE...RETURNING and the row is gone; the second sees null.
      let calls = 0;
      const storedData = {
        key: "lb_test_key_123",
        keyId: "key-id-1",
      };

      const verificationStore: Partial<VerificationStore["Type"]> = {
        consumeByIdentifier: (identifier) => {
          calls += 1;
          if (calls === 1 && identifier === "raycast-connect:valid-code") {
            return Effect.succeed({ id: "ver-1", data: storedData });
          }
          return Effect.succeed(null);
        },
      };

      return Effect.gen(function* () {
        const winner = yield* runExchange(
          { code: "valid-code" },
          { verificationStore }
        );
        expect(winner).toEqual({ apiKey: "lb_test_key_123" });

        const loser = yield* runExchange(
          { code: "valid-code" },
          { verificationStore }
        ).pipe(Effect.flip);
        expect(loser._tag).toBe("InvalidCodeError");
      });
    }
  );

  it.effect("updates key name with device name when provided", () => {
    let updatedId: string | null = null;
    let updatedName: string | null = null;
    const storedData = {
      key: "lb_test_key_123",
      keyId: "key-id-1",
    };

    return runExchange(
      { code: "valid-code", deviceName: "Bohdans-MacBook-Pro" },
      {
        apiKeyStore: {
          updateName: (id, name) => {
            updatedId = id;
            updatedName = name;
            return Effect.void;
          },
        },
        verificationStore: {
          consumeByIdentifier: (identifier) =>
            identifier === "raycast-connect:valid-code"
              ? Effect.succeed({ id: "ver-1", data: storedData })
              : Effect.succeed(null),
        },
      }
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(updatedId).toBe("key-id-1");
          expect(updatedName).toBe("Raycast — Bohdans-MacBook-Pro");
        })
      )
    );
  });

  it.effect("skips name update when deviceName is not provided", () => {
    let updateCalled = false;
    const storedData = {
      key: "lb_test_key_123",
      keyId: "key-id-1",
    };

    return runExchange(
      { code: "valid-code" },
      {
        apiKeyStore: {
          updateName: () => {
            updateCalled = true;
            return Effect.void;
          },
        },
        verificationStore: {
          consumeByIdentifier: (identifier) =>
            identifier === "raycast-connect:valid-code"
              ? Effect.succeed({ id: "ver-1", data: storedData })
              : Effect.succeed(null),
        },
      }
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(updateCalled).toBe(false);
        })
      )
    );
  });
});
