import { deriveDpopAth } from "better-auth/oauth2";
import {
  SignJWT,
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
} from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  mcpAuthorizationChallenge,
  verifyMcpAccessToken,
} from "../../mcp/access-token";

const issuer = "https://cloudstash.test/api/auth";
const audience = "https://cloudstash.test/mcp";

let signingKey: CryptoKey;
let jwks: { keys: Record<string, unknown>[] };

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
  it("verifies issuer, audience, expiry, and signature without network fetch", async () => {
    const token = await accessToken();
    const network = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("unexpected network fetch"));
    const getJwks = vi.fn(async () => jwks);

    const payload = await verifyMcpAccessToken(
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
  });

  it("rejects expired or wrong-audience tokens with the MCP bearer challenge", async () => {
    const expired = await accessToken({}, "-1s");
    const wrongAudience = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "ES256", kid: "cloudstash-test-key" })
      .setIssuer(issuer)
      .setAudience("https://cloudstash.test/not-mcp")
      .setExpirationTime("5m")
      .sign(signingKey);

    for (const token of [expired, wrongAudience]) {
      const cause = await verifyMcpAccessToken(
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
      ).catch((error: unknown) => error);
      const challenge = mcpAuthorizationChallenge(cause, audience, [
        "links:read",
      ]);

      expect(challenge?.status).toBe(401);
      expect(challenge?.headers.get("WWW-Authenticate")).toContain(
        'resource_metadata="https://cloudstash.test/.well-known/oauth-protected-resource/mcp"'
      );
    }
  });

  it("enforces DPoP key binding and shared replay reservations", async () => {
    const proofKeys = await generateKeyPair("ES256");
    const proofJwk = await exportJWK(proofKeys.publicKey);
    const jkt = await calculateJwkThumbprint(proofJwk);
    const token = await accessToken({ cnf: { jkt } });
    const reserve = vi
      .fn<(reservation: unknown) => boolean>()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const makeProof = async () =>
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
        .sign(proofKeys.privateKey);
    const proof = await makeProof();
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

    await expect(
      verifyMcpAccessToken(request(), options)
    ).resolves.toMatchObject({ sub: "user-1" });
    const replay = await verifyMcpAccessToken(request(), options).catch(
      (error: unknown) => error
    );
    const challenge = mcpAuthorizationChallenge(replay, audience, []);

    expect(reserve).toHaveBeenCalledTimes(2);
    expect(challenge?.status).toBe(401);
    expect(challenge?.headers.get("WWW-Authenticate")).toContain(
      'DPoP error="invalid_dpop_proof"'
    );
  });
});
