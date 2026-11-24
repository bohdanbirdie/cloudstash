import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, References } from "effect";

import {
  WorkspaceAccess,
  WorkspaceMembershipRevokedError,
} from "../../auth/workspace-access";
import {
  handleConnectRequest,
  handleExchangeRequest,
} from "../../connect/native";
import {
  ApiKeyStore,
  SessionProvider,
  VerificationStore,
} from "../../connect/services";
import type { SessionData, VerificationData } from "../../connect/services";
import { ApiKey, ApiKeyRowId, OrgId, UserId } from "../../db/branded";

const VERIFIER = "native-test-verifier-abcdefghijklmnopqrstuvwxyz-0123456789";
// base64url(sha256(VERIFIER))
const challengeOf = async (verifier: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return btoa(String.fromCodePoint(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const session: SessionData = {
  orgId: OrgId.make("org-1"),
  userId: UserId.make("user-1"),
};
const minted = {
  id: ApiKeyRowId.make("key-id-1"),
  key: ApiKey.make("lb_native_key"),
};

// One in-memory world shared by connect and exchange, so a test can run the
// real handshake end to end.
const makeWorld = (
  options: {
    session?: SessionData | null;
    authorizeApiKey?: WorkspaceAccess["Service"]["authorizeApiKey"];
  } = {}
) => {
  const codes = new Map<string, VerificationData>();
  const created: { metadata: unknown; name: string }[] = [];
  const renamed: string[] = [];
  const layer = Layer.mergeAll(
    Layer.succeed(SessionProvider, {
      getSession: () =>
        Effect.succeed(
          options.session === undefined ? session : options.session
        ),
    }),
    Layer.succeed(ApiKeyStore, {
      create: (_headers, metadata, name) => {
        created.push({ metadata, name });
        return Effect.succeed(minted);
      },
      deleteById: () => Effect.void,
      listByUser: () => Effect.succeed([]),
      updateName: (_id, name) => {
        renamed.push(name);
        return Effect.void;
      },
    }),
    Layer.succeed(VerificationStore, {
      consumeByIdentifier: (identifier) => {
        const data = codes.get(identifier);
        codes.delete(identifier);
        return Effect.succeed(data ? { data, id: identifier } : null);
      },
      save: (identifier, data) => {
        codes.set(identifier, data);
        return Effect.void;
      },
    }),
    Layer.succeed(WorkspaceAccess, {
      authorizeApiKey:
        options.authorizeApiKey ??
        (() =>
          Effect.succeed({
            orgId: OrgId.make("org-1"),
            userId: UserId.make("user-1"),
          })),
      authorizeIdentity: () => Effect.die("Identity authorization not used"),
      authorizeSession: () => Effect.die("Session authorization not used"),
    })
  );
  const run = <A, E>(
    effect: Effect.Effect<A, E, Layer.Success<typeof layer>>
  ) =>
    effect.pipe(
      Effect.provide(layer),
      Effect.provideService(References.MinimumLogLevel, "Error")
    );
  return { codes, created, renamed, run };
};

describe("native connect", () => {
  it.effect("mints a key and redeems it once with the matching verifier", () =>
    Effect.gen(function* () {
      const world = makeWorld();
      const codeChallenge = yield* Effect.promise(() => challengeOf(VERIFIER));

      const { code } = yield* world.run(
        handleConnectRequest(new Headers(), { codeChallenge })
      );
      expect(world.created).toEqual([
        {
          metadata: { orgId: "org-1", source: "native" },
          name: "Cloudstash for Mac",
        },
      ]);

      const exchanged = yield* world.run(
        handleExchangeRequest({
          code,
          codeVerifier: VERIFIER,
          deviceName: "  Bohdan's MacBook  ",
        })
      );
      expect(exchanged).toEqual({ apiKey: "lb_native_key" });
      expect(world.renamed).toEqual(["Cloudstash for Mac — Bohdan's MacBook"]);

      const replay = yield* world
        .run(handleExchangeRequest({ code, codeVerifier: VERIFIER }))
        .pipe(Effect.flip);
      expect(replay._tag).toBe("InvalidCodeError");
    })
  );

  it.effect("refuses a code presented with another verifier", () =>
    Effect.gen(function* () {
      const world = makeWorld();
      const codeChallenge = yield* Effect.promise(() => challengeOf(VERIFIER));
      const { code } = yield* world.run(
        handleConnectRequest(new Headers(), { codeChallenge })
      );

      const stolen = yield* world
        .run(handleExchangeRequest({ code, codeVerifier: "another-verifier" }))
        .pipe(Effect.flip);
      expect(stolen._tag).toBe("InvalidCodeError");
      // The legitimate app can still finish.
      expect(world.codes.size).toBe(1);
    })
  );

  it.effect("requires a session, a library, and a well-formed challenge", () =>
    Effect.gen(function* () {
      const noSession = yield* makeWorld({ session: null })
        .run(
          handleConnectRequest(new Headers(), { codeChallenge: "A".repeat(43) })
        )
        .pipe(Effect.flip);
      expect(noSession._tag).toBe("ConnectUnauthorizedError");

      const noOrg = yield* makeWorld({
        session: { orgId: null, userId: UserId.make("user-1") },
      })
        .run(
          handleConnectRequest(new Headers(), { codeChallenge: "A".repeat(43) })
        )
        .pipe(Effect.flip);
      expect(noOrg._tag).toBe("NoActiveOrgError");

      const world = makeWorld();
      const badChallenge = yield* world
        .run(handleConnectRequest(new Headers(), { codeChallenge: "short" }))
        .pipe(Effect.flip);
      expect(badChallenge._tag).toBe("MissingCodeError");
      expect(world.created).toEqual([]);
    })
  );

  it.effect("rejects exchange without a code or verifier", () =>
    Effect.gen(function* () {
      const world = makeWorld();
      const missing = yield* world
        .run(handleExchangeRequest({ code: "abc" }))
        .pipe(Effect.flip);
      expect(missing._tag).toBe("MissingCodeError");
    })
  );

  it.effect("rechecks workspace access when the code is exchanged", () =>
    Effect.gen(function* () {
      const world = makeWorld({
        authorizeApiKey: () =>
          Effect.fail(
            new WorkspaceMembershipRevokedError({
              orgId: OrgId.make("org-1"),
              userId: UserId.make("user-1"),
            })
          ),
      });
      const codeChallenge = yield* Effect.promise(() => challengeOf(VERIFIER));
      const { code } = yield* world.run(
        handleConnectRequest(new Headers(), { codeChallenge })
      );
      const denied = yield* world
        .run(handleExchangeRequest({ code, codeVerifier: VERIFIER }))
        .pipe(Effect.flip);
      expect(denied._tag).toBe("ConnectUnauthorizedError");
    })
  );
});
