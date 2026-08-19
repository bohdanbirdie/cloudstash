import { describe, it } from "@effect/vitest";
import { deriveDpopAth } from "better-auth/oauth2";
import { Effect } from "effect";
import {
  SignJWT,
  calculateJwkThumbprint,
  errors as joseErrors,
  exportJWK,
  generateKeyPair,
} from "jose";
import { afterEach, beforeAll, expect, vi } from "vitest";

import {
  McpAccessTokenBackendError,
  McpAccessTokenRejected,
  mcpAuthorizationChallenge,
  verifyMcpAccessToken,
} from "../../mcp/access-token";

const issuer = "https://cloudstash.test/api/auth";
const audience = "https://cloudstash.test/mcp";

let signingKey: CryptoKey;
let jwks: { keys: Record<string, unknown>[] };

afterEach(() => vi.restoreAllMocks());

beforeAll(async () => {
  const pair = await generateKeyPair("ES256");
  signingKey = pair.privateKey;
  jwks = {
    keys: [
      {
        ...(await exportJWK(pair.publicKey)),
        alg: "ES256",
        kid: "cloudstash-test-key",
        use: "sig",
      },
    ],
  };
});

const accessToken = async (
  claims: Record<string, unknown> = {},
  expiresIn = "5m"
) =>
  new SignJWT({
    client_id: "mcp-client",
    scope: "links:read links:write",
    sub: "user-1",
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256", kid: "cloudstash-test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(signingKey);

describe("local MCP access-token verification", () => {
  it.effect(
    "verifies issuer, audience, expiry, and signature without network fetch",
    () =>
      Effect.gen(function* () {
        const token = yield* Effect.promise(() => accessToken());
        const network = vi
          .spyOn(globalThis, "fetch")
          .mockRejectedValue(new Error("unexpected network fetch"));
        const getJwks = vi.fn(async () => jwks);

        const payload = yield* verifyMcpAccessToken(
          new Request(audience, {
            headers: { Authorization: `Bearer ${token}` },
            method: "POST",
          }),
          {
            audience,
            issuer,
            jwks: getJwks,
            replayStore: { reserve: vi.fn(() => true) },
          }
        );

        expect(payload.sub).toBe("user-1");
        expect(getJwks).toHaveBeenCalledOnce();
        expect(network).not.toHaveBeenCalled();
        network.mockRestore();
      })
  );

  it.effect(
    "rejects expired or wrong-audience tokens with the MCP bearer challenge",
    () =>
      Effect.gen(function* () {
        const expired = yield* Effect.promise(() => accessToken({}, "-1s"));
        const wrongAudience = yield* Effect.promise(() =>
          new SignJWT({ sub: "user-1" })
            .setProtectedHeader({ alg: "ES256", kid: "cloudstash-test-key" })
            .setIssuer(issuer)
            .setAudience("https://cloudstash.test/not-mcp")
            .setExpirationTime("5m")
            .sign(signingKey)
        );

        for (const token of [expired, wrongAudience]) {
          const failure = yield* verifyMcpAccessToken(
            new Request(audience, {
              headers: { Authorization: `Bearer ${token}` },
              method: "POST",
            }),
            {
              audience,
              issuer,
              jwks: async () => jwks,
              replayStore: { reserve: () => true },
            }
          ).pipe(Effect.flip);
          expect(failure).toBeInstanceOf(McpAccessTokenRejected);
          if (!(failure instanceof McpAccessTokenRejected)) continue;
          const challenge = mcpAuthorizationChallenge(failure, audience, [
            "links:read",
          ]);

          expect(challenge.status).toBe(401);
          expect(challenge.headers.get("WWW-Authenticate")).toContain(
            'resource_metadata="https://cloudstash.test/.well-known/oauth-protected-resource/mcp"'
          );
        }
      })
  );

  it.effect("classifies JWKS infrastructure failures as backend errors", () =>
    Effect.gen(function* () {
      const token = yield* Effect.promise(() => accessToken());
      const failure = yield* verifyMcpAccessToken(
        new Request(audience, {
          headers: { Authorization: `Bearer ${token}` },
          method: "POST",
        }),
        {
          audience,
          issuer,
          jwks: () => Promise.reject(new joseErrors.JWKSTimeout()),
          replayStore: { reserve: () => true },
        }
      ).pipe(Effect.flip);

      expect(failure).toBeInstanceOf(McpAccessTokenBackendError);
    })
  );

  it.effect("enforces DPoP key binding and shared replay reservations", () =>
    Effect.gen(function* () {
      const proofKeys = yield* Effect.promise(() => generateKeyPair("ES256"));
      const proofJwk = yield* Effect.promise(() =>
        exportJWK(proofKeys.publicKey)
      );
      const jkt = yield* Effect.promise(() => calculateJwkThumbprint(proofJwk));
      const token = yield* Effect.promise(() => accessToken({ cnf: { jkt } }));
      const reserve = vi
        .fn<(reservation: unknown) => boolean>()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      const proof = yield* Effect.promise(async () =>
        new SignJWT({
          ath: await deriveDpopAth(token),
          htm: "POST",
          htu: audience,
          iat: Math.floor(Date.now() / 1000),
          jti: "proof-1",
        })
          .setProtectedHeader({
            alg: "ES256",
            jwk: proofJwk,
            typ: "dpop+jwt",
          })
          .sign(proofKeys.privateKey)
      );
      const request = () =>
        new Request(audience, {
          headers: { Authorization: `DPoP ${token}`, DPoP: proof },
          method: "POST",
        });
      const options = {
        audience,
        issuer,
        jwks: async () => jwks,
        replayStore: { reserve },
      };

      const payload = yield* verifyMcpAccessToken(request(), options);
      expect(payload).toMatchObject({ sub: "user-1" });
      const replay = yield* verifyMcpAccessToken(request(), options).pipe(
        Effect.flip
      );
      expect(replay).toBeInstanceOf(McpAccessTokenRejected);
      if (!(replay instanceof McpAccessTokenRejected)) return;
      const challenge = mcpAuthorizationChallenge(replay, audience, []);

      expect(reserve).toHaveBeenCalledTimes(2);
      expect(challenge.status).toBe(401);
      expect(challenge.headers.get("WWW-Authenticate")).toContain(
        'DPoP error="invalid_dpop_proof"'
      );
    })
  );
});
