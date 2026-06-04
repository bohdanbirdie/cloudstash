import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, LogLevel, Logger } from "effect";

import { AuthClient } from "../../auth/service";
import { ApiKey, ApiKeyRowId, OrgId, UserId } from "../../db/branded";
import { DbClient, DbError } from "../../db/service";
import { KeyCreationError } from "../errors";
import {
  handleAccountRequest,
  handleConnectRequest,
  handleDisconnectRequest,
} from "../extension";
import { ApiKeyStore, SessionProvider } from "../services";
import type { SessionData } from "../services";

function makeSessionLayer(result: SessionData | null) {
  return Layer.succeed(SessionProvider, {
    getSession: () => Effect.succeed(result),
  });
}

function makeApiKeyLayer(overrides: Partial<ApiKeyStore["Type"]> = {}) {
  return Layer.succeed(ApiKeyStore, {
    listByUser: () => Effect.succeed([]),
    deleteById: () => Effect.void,
    create: () =>
      Effect.succeed({
        key: ApiKey.make("lb_ext_key_123"),
        id: ApiKeyRowId.make("ext-key-id-1"),
      }),
    updateName: () => Effect.void,
    ...overrides,
  });
}

type VerifyResult = {
  valid: boolean;
  key: { id?: string; referenceId: string | null; metadata: unknown } | null;
};

function makeDbStub(name: string | null, image: string | null = null) {
  const rows = name === null ? [] : [{ name, image }];
  return Layer.succeed(DbClient, {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(rows),
      }),
    }),
  } as unknown as DbClient["Type"]);
}

function makeAuthClientLayer(verifyApiKey: () => Promise<VerifyResult>) {
  return Layer.succeed(AuthClient, {
    api: {
      verifyApiKey,
      getSession: () => Promise.resolve(null),
    },
  } as unknown as AuthClient["Type"]);
}

function runAccount(
  apiKey: string | null,
  options: {
    verifyApiKey?: () => Promise<VerifyResult>;
    userName?: string | null;
    userImage?: string | null;
  } = {}
) {
  const layer = Layer.mergeAll(
    makeAuthClientLayer(
      options.verifyApiKey ??
        (() => Promise.resolve<VerifyResult>({ valid: false, key: null }))
    ),
    makeDbStub(
      options.userName === undefined ? "Ada Lovelace" : options.userName,
      options.userImage ?? null
    )
  );

  return handleAccountRequest(
    apiKey === null ? null : ApiKey.make(apiKey)
  ).pipe(Effect.provide(layer), Logger.withMinimumLogLevel(LogLevel.Error));
}

function runConnect(
  options: {
    session?: SessionData | null;
    apiKeyStore?: Partial<ApiKeyStore["Type"]>;
  } = {}
) {
  const layer = Layer.mergeAll(
    makeSessionLayer(options.session ?? null),
    makeApiKeyLayer(options.apiKeyStore)
  );

  return handleConnectRequest(new Headers()).pipe(
    Effect.provide(layer),
    Logger.withMinimumLogLevel(LogLevel.Error)
  );
}

describe("ExtensionConnect.handleConnectRequest", () => {
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

  it.effect("propagates KeyCreationError from create", () =>
    runConnect({
      session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
      apiKeyStore: {
        create: () =>
          Effect.fail(new KeyCreationError({ reason: "missing_key" })),
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

  it.effect("returns apiKey and orgId on success", () =>
    runConnect({
      session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
    }).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({
            apiKey: "lb_ext_key_123",
            orgId: "org-1",
          });
        })
      )
    )
  );

  it.effect("passes chrome-extension source metadata to create", () => {
    let capturedMetadata: unknown = null;
    let capturedName: unknown = null;

    return runConnect({
      session: { userId: UserId.make("user-1"), orgId: OrgId.make("org-1") },
      apiKeyStore: {
        create: (_headers, metadata, name) => {
          capturedMetadata = metadata;
          capturedName = name;
          return Effect.succeed({
            key: ApiKey.make("lb_ext"),
            id: ApiKeyRowId.make("ext-id"),
          });
        },
      },
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(capturedMetadata).toEqual({
            orgId: "org-1",
            source: "chrome-extension",
          });
          expect(capturedName).toBe("Chrome Extension");
        })
      )
    );
  });
});

describe("ExtensionConnect.handleAccountRequest", () => {
  const validKey = (): Promise<VerifyResult> =>
    Promise.resolve({
      valid: true,
      key: { referenceId: "user-1", metadata: { orgId: "org-1" } },
    });

  it.effect("fails with ConnectUnauthorizedError when apiKey is missing", () =>
    runAccount(null).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("ConnectUnauthorizedError");
        })
      )
    )
  );

  it.effect("fails with ConnectUnauthorizedError when key is invalid", () =>
    runAccount("lb_bad", {
      verifyApiKey: () => Promise.resolve({ valid: false, key: null }),
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("ConnectUnauthorizedError");
        })
      )
    )
  );

  it.effect("fails with SessionLookupError when verifyApiKey rejects", () =>
    runAccount("lb_ok", {
      verifyApiKey: () => Promise.reject(new Error("auth backend down")),
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("SessionLookupError");
        })
      )
    )
  );

  it.effect(
    "fails with ConnectUnauthorizedError when key metadata is missing orgId",
    () =>
      runAccount("lb_ok", {
        verifyApiKey: () =>
          Promise.resolve({
            valid: true,
            key: { referenceId: "user-1", metadata: null },
          }),
      }).pipe(
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error._tag).toBe("ConnectUnauthorizedError");
          })
        )
      )
  );

  it.effect("returns user name and image for any valid key", () =>
    runAccount("lb_ok", {
      verifyApiKey: validKey,
      userName: "Ada Lovelace",
      userImage: "https://lh3.googleusercontent.com/a/ada",
    }).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({
            user: {
              name: "Ada Lovelace",
              image: "https://lh3.googleusercontent.com/a/ada",
            },
          });
        })
      )
    )
  );

  it.effect("returns null name and image when the user row is missing", () =>
    runAccount("lb_ok", {
      verifyApiKey: validKey,
      userName: null,
    }).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({
            user: { name: null, image: null },
          });
        })
      )
    )
  );
});

describe("ExtensionConnect.handleDisconnectRequest", () => {
  const validKey = (): Promise<VerifyResult> =>
    Promise.resolve({
      valid: true,
      key: {
        id: "ext-key-id-1",
        referenceId: "user-1",
        metadata: { orgId: "org-1" },
      },
    });

  function runDisconnect(
    apiKey: string | null,
    options: {
      verifyApiKey?: () => Promise<VerifyResult>;
      apiKeyStore?: Partial<ApiKeyStore["Type"]>;
    } = {}
  ) {
    const layer = Layer.mergeAll(
      makeAuthClientLayer(
        options.verifyApiKey ??
          (() => Promise.resolve<VerifyResult>({ valid: false, key: null }))
      ),
      makeApiKeyLayer(options.apiKeyStore)
    );

    return handleDisconnectRequest(
      apiKey === null ? null : ApiKey.make(apiKey)
    ).pipe(Effect.provide(layer), Logger.withMinimumLogLevel(LogLevel.Error));
  }

  it.effect("fails with ConnectUnauthorizedError when apiKey is missing", () =>
    runDisconnect(null).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("ConnectUnauthorizedError");
        })
      )
    )
  );

  it.effect("fails with ConnectUnauthorizedError when key is invalid", () =>
    runDisconnect("lb_bad", {
      verifyApiKey: () => Promise.resolve({ valid: false, key: null }),
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("ConnectUnauthorizedError");
        })
      )
    )
  );

  it.effect("fails with SessionLookupError when verifyApiKey rejects", () =>
    runDisconnect("lb_ok", {
      verifyApiKey: () => Promise.reject(new Error("auth backend down")),
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("SessionLookupError");
        })
      )
    )
  );

  it.effect("deletes the verified key's row and returns ok", () => {
    let deletedId: string | null = null;
    return runDisconnect("lb_ok", {
      verifyApiKey: validKey,
      apiKeyStore: {
        deleteById: (id) => {
          deletedId = id;
          return Effect.void;
        },
      },
    }).pipe(
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({ ok: true });
          expect(deletedId).toBe("ext-key-id-1");
        })
      )
    );
  });

  it.effect("propagates DbError when deleteById fails", () =>
    runDisconnect("lb_ok", {
      verifyApiKey: validKey,
      apiKeyStore: {
        deleteById: () =>
          Effect.fail(new DbError({ cause: new Error("d1 down") })),
      },
    }).pipe(
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("DbError");
        })
      )
    )
  );
});
