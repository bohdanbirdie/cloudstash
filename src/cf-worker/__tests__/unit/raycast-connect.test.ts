import { Effect, Layer, LogLevel, Logger } from "effect";
import { describe, expect, it } from "vitest";

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
  it("fails with UnauthorizedError when session is null", async () => {
    const error = await Effect.runPromise(
      runConnect({ session: null }).pipe(Effect.flip)
    );
    expect(error._tag).toBe("UnauthorizedError");
  });

  it("fails with NoActiveOrgError when orgId is null", async () => {
    const error = await Effect.runPromise(
      runConnect({
        session: { userId: UserId.make("user-1"), orgId: null },
      }).pipe(Effect.flip)
    );
    expect(error._tag).toBe("NoActiveOrgError");
  });

  it("fails with KeyCreationError when create returns null", async () => {
    const error = await Effect.runPromise(
      runConnect({
        session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
        apiKeyStore: { create: () => Effect.succeed(null) },
      }).pipe(Effect.flip)
    );
    expect(error._tag).toBe("KeyCreationError");
  });

  it("returns code on success", async () => {
    const result = await Effect.runPromise(
      runConnect({
        session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
      })
    );

    expect(result).toHaveProperty("code");
    expect(typeof result.code).toBe("string");
  });

  it("passes correct metadata to create", async () => {
    let capturedMetadata: unknown = null;
    let capturedName: unknown = null;

    await Effect.runPromise(
      runConnect({
        session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
        apiKeyStore: {
          create: (_headers, metadata, name) => {
            capturedMetadata = metadata;
            capturedName = name;
            return Effect.succeed({ key: "lb_key", id: "key-id" });
          },
        },
      })
    );

    expect(capturedMetadata).toEqual({ orgId: "org-1", source: "raycast" });
    expect(capturedName).toBe("Raycast Extension");
  });

  it("saves verification with key and keyId as JSON", async () => {
    let capturedIdentifier: string | null = null;
    let capturedData: unknown = null;

    await Effect.runPromise(
      runConnect({
        session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
        verificationStore: {
          save: (identifier, data) => {
            capturedIdentifier = identifier;
            capturedData = data;
            return Effect.void;
          },
        },
      })
    );

    expect(capturedIdentifier).toMatch(/^raycast-connect:/);
    expect(capturedData).toEqual({ key: "lb_test_key_123", keyId: "key-id-1" });
  });
});

describe("handleExchangeRequest", () => {
  it("fails with MissingCodeError when code is missing", async () => {
    const error = await Effect.runPromise(runExchange({}).pipe(Effect.flip));
    expect(error._tag).toBe("MissingCodeError");
  });

  it("fails with InvalidCodeError when verification record not found", async () => {
    const error = await Effect.runPromise(
      runExchange({ code: "bad-code" }).pipe(Effect.flip)
    );
    expect(error._tag).toBe("InvalidCodeError");
  });

  it("returns apiKey and deletes verification on success", async () => {
    let deletedId: string | null = null;
    const storedData = {
      key: "lb_test_key_123",
      keyId: "key-id-1",
    };

    const result = await Effect.runPromise(
      runExchange(
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
      )
    );

    expect(result).toEqual({ apiKey: "lb_test_key_123" });
    expect(deletedId).toBe("ver-1");
  });

  it("updates key name with device name when provided", async () => {
    let updatedId: string | null = null;
    let updatedName: string | null = null;
    const storedData = {
      key: "lb_test_key_123",
      keyId: "key-id-1",
    };

    await Effect.runPromise(
      runExchange(
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
      )
    );

    expect(updatedId).toBe("key-id-1");
    expect(updatedName).toBe("Raycast — Bohdans-MacBook-Pro");
  });

  it("skips name update when deviceName is not provided", async () => {
    let updateCalled = false;
    const storedData = {
      key: "lb_test_key_123",
      keyId: "key-id-1",
    };

    await Effect.runPromise(
      runExchange(
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
      )
    );

    expect(updateCalled).toBe(false);
  });
});
