import { Effect, Layer, LogLevel, Logger } from "effect";
import { it, describe } from "@effect/vitest";
import { expect } from "vitest";

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
    findValid: () => Effect.succeed(null),
    deleteById: () => Effect.void,
    ...overrides,
  });
}

function runConnect(
  options: {
    session?: SessionData | null;
    apiKeyStore?: Partial<ApiKeyStore["Type"]>;
    verificationStore?: Partial<VerificationStore["Type"]>;
  } = {}
) {
  const layer = Layer.mergeAll(
    makeSessionLayer(options.session ?? null),
    makeApiKeyLayer(options.apiKeyStore),
    makeVerificationLayer(options.verificationStore)
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
    makeVerificationLayer(options.verificationStore)
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
      Effect.tap((error) => Effect.sync(() => {
        expect(error._tag).toBe("ConnectUnauthorizedError");
      }))
    )
  );

  it.effect("fails with NoActiveOrgError when orgId is null", () =>
    runConnect({
      session: { userId: UserId.make("user-1"), orgId: null },
    }).pipe(
      Effect.flip,
      Effect.tap((error) => Effect.sync(() => {
        expect(error._tag).toBe("NoActiveOrgError");
      }))
    )
  );

  it.effect("fails with KeyCreationError when create returns null", () =>
    runConnect({
      session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
      apiKeyStore: { create: () => Effect.succeed(null) },
    }).pipe(
      Effect.flip,
      Effect.tap((error) => Effect.sync(() => {
        expect(error._tag).toBe("KeyCreationError");
      }))
    )
  );

  it.effect("returns code on success", () =>
    runConnect({
      session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
    }).pipe(
      Effect.tap((result) => Effect.sync(() => {
        expect(result).toHaveProperty("code");
        expect(typeof result.code).toBe("string");
      }))
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
      Effect.tap(() => Effect.sync(() => {
        expect(capturedMetadata).toEqual({ orgId: "org-1", source: "raycast" });
        expect(capturedName).toBe("Raycast Extension");
      }))
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
      Effect.tap(() => Effect.sync(() => {
        expect(capturedIdentifier).toMatch(/^raycast-connect:/);
        expect(capturedData).toEqual({ key: "lb_test_key_123", keyId: "key-id-1" });
      }))
    );
  });
});

describe("handleExchangeRequest", () => {
  it.effect("fails with MissingCodeError when code is missing", () =>
    runExchange({}).pipe(
      Effect.flip,
      Effect.tap((error) => Effect.sync(() => {
        expect(error._tag).toBe("MissingCodeError");
      }))
    )
  );

  it.effect("fails with InvalidCodeError when verification record not found", () =>
    runExchange({ code: "bad-code" }).pipe(
      Effect.flip,
      Effect.tap((error) => Effect.sync(() => {
        expect(error._tag).toBe("InvalidCodeError");
      }))
    )
  );

  it.effect("returns apiKey and deletes verification on success", () => {
    let deletedId: string | null = null;
    const storedData = {
      key: "lb_test_key_123",
      keyId: "key-id-1",
    };

    return runExchange(
      { code: "valid-code" },
      {
        verificationStore: {
          findValid: (identifier) =>
            identifier === "raycast-connect:valid-code"
              ? Effect.succeed({ id: "ver-1", data: storedData })
              : Effect.succeed(null),
          deleteById: (id) => {
            deletedId = id;
            return Effect.void;
          },
        },
      }
    ).pipe(
      Effect.tap((result) => Effect.sync(() => {
        expect(result).toEqual({ apiKey: "lb_test_key_123" });
        expect(deletedId).toBe("ver-1");
      }))
    );
  });

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
          findValid: (identifier) =>
            identifier === "raycast-connect:valid-code"
              ? Effect.succeed({ id: "ver-1", data: storedData })
              : Effect.succeed(null),
          deleteById: () => Effect.void,
        },
      }
    ).pipe(
      Effect.tap(() => Effect.sync(() => {
        expect(updatedId).toBe("key-id-1");
        expect(updatedName).toBe("Raycast — Bohdans-MacBook-Pro");
      }))
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
          findValid: (identifier) =>
            identifier === "raycast-connect:valid-code"
              ? Effect.succeed({ id: "ver-1", data: storedData })
              : Effect.succeed(null),
          deleteById: () => Effect.void,
        },
      }
    ).pipe(
      Effect.tap(() => Effect.sync(() => {
        expect(updateCalled).toBe(false);
      }))
    );
  });
});
