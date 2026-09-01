import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { fetch as workerFetch } from "../../index";
import { installTestMetadataFetcher, signupUser } from "./helpers";
import type { UserInfo } from "./helpers";

const AUTH_ORIGIN = "http://localhost";
const AUTH_ISSUER = `${AUTH_ORIGIN}/api/auth`;
const MCP_RESOURCE = `${AUTH_ORIGIN}/mcp`;
const REDIRECT_URI = "http://127.0.0.1:6274/oauth/callback";
const SCOPES = "openid offline_access links:read links:write";
const SAVED_LINK_URL = "https://example.com/from-mcp";
const WORKSPACE_A_URL = "https://example.com/workspace-proof-a";
const WORKSPACE_B_URL = "https://example.com/workspace-proof-b";
const WORKSPACE_CLAIM = "https://cloudstash.dev/claims/workspace-id";

type RegisteredClient = {
  application_type: "native" | "web";
  client_id: string;
  token_endpoint_auth_method: string;
};

type TokenSet = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
};

type JsonRpcResponse<Result = unknown> = {
  error?: { code: number; message: string };
  id: number | null;
  jsonrpc: "2.0";
  result?: Result;
};

type AuthorizationPrompt = {
  consentCookie: string;
  consentUrl: URL;
  verifier: string;
};

const decodeJwtPayload = (token: string): Record<string, unknown> => {
  const encoded = token.split(".")[1];
  if (!encoded) throw new Error("Access token is not a JWT");
  const normalized = encoded.replaceAll("-", "+").replaceAll("_", "/");
  return JSON.parse(atob(normalized)) as Record<string, unknown>;
};

const workerUrl = (endpoint: string): string => {
  const url = new URL(endpoint);
  return `http://worker${url.pathname}${url.search}`;
};

const cookiePair = (setCookie: string): string => setCookie.split(";", 1)[0];

const mergeCookies = (...setCookies: string[]): string => {
  const pairs = new Map<string, string>();
  for (const setCookie of setCookies) {
    const pair = cookiePair(setCookie);
    pairs.set(pair.split("=", 1)[0], pair);
  }
  return [...pairs.values()].join("; ");
};

const pkceChallenge = async (verifier: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier)
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const registerClient = async (
  overrides: Record<string, unknown> = {}
): Promise<Response> =>
  SELF.fetch("http://worker/api/auth/oauth2/register", {
    body: JSON.stringify({
      client_name: "MCP JAM",
      application_type: "native",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [REDIRECT_URI],
      resources: [MCP_RESOURCE],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...overrides,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

// MCP JAM's 2026-07-28 flow explicitly sends application_type=native.
// Keep this wire shape exact; older clients that omitted the field are tested
// separately through the bounded exact-loopback compatibility path.
const registerCurrentMcpJamClient = async (): Promise<RegisteredClient> => {
  const response = await registerClient();

  expect(response.status, `DCR failed: ${await response.clone().text()}`).toBe(
    201
  );
  return response.json<RegisteredClient>();
};

const beginAuthorization = async (
  user: UserInfo,
  client: RegisteredClient,
  scopes = SCOPES
): Promise<AuthorizationPrompt> => {
  const verifier =
    "mcp-jam-test-verifier-abcdefghijklmnopqrstuvwxyz-0123456789";
  const challenge = await pkceChallenge(verifier);
  const authorizeUrl = new URL("/api/auth/oauth2/authorize", AUTH_ORIGIN);
  authorizeUrl.search = new URLSearchParams({
    client_id: client.client_id,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: REDIRECT_URI,
    resource: MCP_RESOURCE,
    response_type: "code",
    scope: scopes,
    state: "mcp-jam-state",
  }).toString();

  const authorize = await SELF.fetch(workerUrl(authorizeUrl.toString()), {
    headers: { Cookie: cookiePair(user.cookie) },
    redirect: "manual",
  });
  expect(authorize.status).toBe(302);
  const consentLocation = authorize.headers.get("location");
  expect(consentLocation).toBeTruthy();
  const consentUrl = new URL(consentLocation!, AUTH_ORIGIN);
  expect(consentUrl.pathname).toBe("/oauth-consent");
  expect(consentUrl.searchParams.get("sig")).toBeTruthy();
  const consentCookie = mergeCookies(
    user.cookie,
    ...authorize.headers.getSetCookie()
  );

  return { consentCookie, consentUrl, verifier };
};

const authorizeClient = async (
  user: UserInfo,
  client: RegisteredClient,
  scopes = SCOPES
): Promise<TokenSet> => {
  const { consentCookie, consentUrl, verifier } = await beginAuthorization(
    user,
    client,
    scopes
  );

  const consent = await SELF.fetch("http://worker/api/auth/oauth2/consent", {
    body: JSON.stringify({
      accept: true,
      oauth_query: consentUrl.searchParams.toString(),
      scope: scopes,
    }),
    headers: {
      Cookie: consentCookie,
      "Content-Type": "application/json",
      Origin: AUTH_ORIGIN,
    },
    method: "POST",
  });
  expect(
    consent.status,
    `Consent failed: ${await consent.clone().text()}`
  ).toBe(200);
  const consentBody = await consent.json<{ url: string }>();
  const callback = new URL(consentBody.url);
  expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
  expect(callback.searchParams.get("state")).toBe("mcp-jam-state");
  const code = callback.searchParams.get("code");
  expect(code).toBeTruthy();

  const token = await SELF.fetch("http://worker/api/auth/oauth2/token", {
    body: new URLSearchParams({
      client_id: client.client_id,
      code: code!,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      resource: MCP_RESOURCE,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });
  expect(token.status, `Token failed: ${await token.clone().text()}`).toBe(200);
  return token.json<TokenSet>();
};

const refreshClient = async (
  client: RegisteredClient,
  refreshToken: string
): Promise<Response> =>
  SELF.fetch("http://worker/api/auth/oauth2/token", {
    body: new URLSearchParams({
      client_id: client.client_id,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      resource: MCP_RESOURCE,
    }),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    method: "POST",
  });

const tamperJwtSignature = (token: string): string => {
  const parts = token.split(".");
  const signature = parts[2];
  if (parts.length !== 3 || !signature) throw new Error("Token is not a JWT");
  parts[2] = `${signature[0] === "a" ? "b" : "a"}${signature.slice(1)}`;
  return parts.join(".");
};

const parseMcpResponse = async <Result>(
  response: Response
): Promise<JsonRpcResponse<Result>> => {
  const text = await response.text();
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    return JSON.parse(text) as JsonRpcResponse<Result>;
  }

  const data = text
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  if (!data) throw new Error(`MCP response did not contain an event: ${text}`);
  return JSON.parse(data) as JsonRpcResponse<Result>;
};

const callMcp = async <Result>(
  accessToken: string,
  id: number,
  method: string,
  params?: Record<string, unknown>
): Promise<{ body: JsonRpcResponse<Result>; response: Response }> => {
  const response = await SELF.fetch(MCP_RESOURCE, {
    body: JSON.stringify({ id, jsonrpc: "2.0", method, params }),
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Host: new URL(MCP_RESOURCE).host,
      "MCP-Protocol-Version": "2025-11-25",
    },
    method: "POST",
  });
  const body = await parseMcpResponse<Result>(response.clone());
  return { body, response };
};

const callModernMcp = async <Result>(
  accessToken: string,
  id: number,
  method: string,
  params: Record<string, unknown> = {}
): Promise<{ body: JsonRpcResponse<Result>; response: Response }> => {
  const response = await SELF.fetch(MCP_RESOURCE, {
    body: JSON.stringify({
      id,
      jsonrpc: "2.0",
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/clientCapabilities": {},
          "io.modelcontextprotocol/clientInfo": {
            name: "MCP JAM",
            version: "test",
          },
          "io.modelcontextprotocol/protocolVersion": "2026-07-28",
        },
      },
    }),
    headers: {
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Host: new URL(MCP_RESOURCE).host,
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": method,
    },
    method: "POST",
  });
  const body = await parseMcpResponse<Result>(response.clone());
  return { body, response };
};

describe("MCP OAuth Worker flow", () => {
  let user: UserInfo;
  let client: RegisteredClient;
  let tokens: TokenSet;
  let expiredAssertionCountAfterToken = -1;
  const observedOutboundUrls: string[] = [];

  beforeAll(async () => {
    user = await signupUser("mcp-oauth@test.com", "MCP OAuth User");
    await env.DB.prepare(
      "UPDATE organization SET tier = 'pro', feature_overrides = ? WHERE id = ?"
    )
      .bind(JSON.stringify({ aiSummary: false }), user.orgId)
      .run();
    await installTestMetadataFetcher(
      env.LINK_PROCESSOR_DO.get(env.LINK_PROCESSOR_DO.idFromName(user.orgId)),
      (url) => observedOutboundUrls.push(url)
    );
    client = await registerCurrentMcpJamClient();
    await env.DB.prepare(
      "INSERT INTO oauth_client_assertion (id, expires_at) VALUES (?, ?)"
    )
      .bind("expired-before-token", Date.now() - 60_000)
      .run();
    tokens = await authorizeClient(user, client);
    expiredAssertionCountAfterToken =
      (
        await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM oauth_client_assertion WHERE id = ?"
        )
          .bind("expired-before-token")
          .first<{ count: number }>()
      )?.count ?? -1;
  });

  it("publishes usable OAuth discovery metadata", async () => {
    const resource = await SELF.fetch(
      "http://worker/.well-known/oauth-protected-resource/mcp"
    );
    expect(resource.status).toBe(200);
    const resourceMetadata = await resource.json<Record<string, unknown>>();
    expect(resourceMetadata).toMatchObject({
      authorization_servers: [AUTH_ISSUER],
      resource: MCP_RESOURCE,
    });
    expect(resourceMetadata).not.toHaveProperty("scopes_supported");

    const authorization = await SELF.fetch(
      "http://worker/.well-known/oauth-authorization-server/api/auth",
      { headers: { Origin: AUTH_ORIGIN } }
    );
    expect(authorization.status).toBe(200);
    expect(authorization.headers.get("Access-Control-Allow-Origin")).toBe(
      AUTH_ORIGIN
    );
    const authorizationMetadata =
      await authorization.json<Record<string, unknown>>();
    expect(authorizationMetadata).toMatchObject({
      authorization_endpoint: `${AUTH_ORIGIN}/api/auth/oauth2/authorize`,
      registration_endpoint: `${AUTH_ORIGIN}/api/auth/oauth2/register`,
      scopes_supported: SCOPES.split(" "),
      token_endpoint: `${AUTH_ORIGIN}/api/auth/oauth2/token`,
    });

    const preflight = await SELF.fetch(
      "http://worker/.well-known/oauth-authorization-server/api/auth",
      {
        headers: {
          "Access-Control-Request-Headers": "accept, content-type",
          "Access-Control-Request-Method": "GET",
          Origin: AUTH_ORIGIN,
        },
        method: "OPTIONS",
      }
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe(
      AUTH_ORIGIN
    );
    expect(preflight.headers.get("Access-Control-Allow-Methods")).toContain(
      "OPTIONS"
    );
  });

  it("keeps Executor authorized with a rotating 30-day refresh token", async () => {
    const resourceResponse = await SELF.fetch(
      "http://worker/.well-known/oauth-protected-resource/mcp"
    );
    const resourceMetadata = await resourceResponse.json<{
      scopes_supported?: string[];
    }>();
    const authorizationResponse = await SELF.fetch(
      "http://worker/.well-known/oauth-authorization-server/api/auth"
    );
    const authorizationMetadata = await authorizationResponse.json<{
      scopes_supported: string[];
    }>();

    // Executor currently uses protected-resource scopes when present and only
    // falls back to authorization-server scopes when they are absent.
    const executorScopes = (
      resourceMetadata.scopes_supported ??
      authorizationMetadata.scopes_supported
    ).join(" ");
    expect(executorScopes.split(" ")).toEqual(
      expect.arrayContaining(SCOPES.split(" "))
    );

    const registration = await registerClient({
      application_type: undefined,
      client_name: "Executor",
    });
    expect(
      registration.status,
      `DCR failed: ${await registration.clone().text()}`
    ).toBe(201);
    const executorClient = await registration.json<RegisteredClient>();
    expect(executorClient.application_type).toBe("native");

    const executorTokens = await authorizeClient(
      user,
      executorClient,
      executorScopes
    );
    expect(executorTokens.expires_in).toBe(5 * 60);
    expect(executorTokens.refresh_token).toBeTruthy();

    const storedRefreshToken = await env.DB.prepare(
      `SELECT created_at AS createdAt, expires_at AS expiresAt
       FROM oauth_refresh_token
       WHERE client_id = ? AND rotated_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`
    )
      .bind(executorClient.client_id)
      .first<{ createdAt: number; expiresAt: number }>();
    expect(storedRefreshToken).not.toBeNull();
    expect(storedRefreshToken!.expiresAt - storedRefreshToken!.createdAt).toBe(
      30 * 24 * 60 * 60 * 1_000
    );

    const refresh = await refreshClient(
      executorClient,
      executorTokens.refresh_token!
    );
    expect(refresh.status, await refresh.clone().text()).toBe(200);
    const refreshedTokens = await refresh.json<TokenSet>();
    expect(refreshedTokens.expires_in).toBe(5 * 60);
    expect(refreshedTokens.refresh_token).toBeTruthy();
    expect(refreshedTokens.refresh_token).not.toBe(
      executorTokens.refresh_token
    );
  });

  it("advertises OAuth from the initial unauthenticated MCP request", async () => {
    const response = await SELF.fetch(MCP_RESOURCE, {
      body: JSON.stringify({ id: 1, jsonrpc: "2.0", method: "tools/list" }),
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        Host: new URL(MCP_RESOURCE).host,
        Origin: AUTH_ORIGIN,
      },
      method: "POST",
    });

    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      AUTH_ORIGIN
    );
    expect(response.headers.get("WWW-Authenticate")).toContain(
      `resource_metadata="${AUTH_ORIGIN}/.well-known/oauth-protected-resource/mcp"`
    );
  });

  it("serves the MCP CORS preflight", async () => {
    const response = await SELF.fetch(MCP_RESOURCE, {
      headers: {
        "Access-Control-Request-Headers":
          "authorization, content-type, mcp-protocol-version",
        "Access-Control-Request-Method": "POST",
        Host: new URL(MCP_RESOURCE).host,
        Origin: AUTH_ORIGIN,
      },
      method: "OPTIONS",
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      AUTH_ORIGIN
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
      "POST"
    );
  });

  it("registers the MCP JAM 2026-07-28 public client and issues workspace tokens", () => {
    expect(client.application_type).toBe("native");
    expect(client.client_id).toBeTruthy();
    expect(client.token_endpoint_auth_method).toBe("none");
    expect(tokens.access_token).toBeTruthy();
    expect(tokens.refresh_token).toBeTruthy();
    expect(tokens.scope.split(" ")).toEqual(
      expect.arrayContaining(SCOPES.split(" "))
    );
    expect(tokens.token_type).toBe("Bearer");
    expect(decodeJwtPayload(tokens.access_token)).toMatchObject({
      aud: expect.arrayContaining([MCP_RESOURCE]),
      client_id: client.client_id,
      iss: AUTH_ISSUER,
      sub: user.userId,
      [WORKSPACE_CLAIM]: user.orgId,
    });
  });

  it("cleans expired client assertions on every token flow", () => {
    expect(expiredAssertionCountAfterToken).toBe(0);
  });

  it("rejects confidential authentication metadata from public DCR", async () => {
    for (const overrides of [
      { token_endpoint_auth_method: undefined },
      { token_endpoint_auth_method: "private_key_jwt", jwks: { keys: [] } },
      { token_endpoint_auth_method: "client_secret_basic" },
      { jwks_uri: "https://client.example/jwks.json" },
    ]) {
      const response = await registerClient(overrides);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "invalid_client_metadata",
      });
    }
  });

  it("preserves explicit web clients and applies web redirect rules", async () => {
    const accepted = await registerClient({
      application_type: "web",
      redirect_uris: ["https://client.example/callback"],
    });
    expect(accepted.status).toBe(201);
    expect(await accepted.json<RegisteredClient>()).toMatchObject({
      application_type: "web",
    });

    const rejected = await registerClient({ application_type: "web" });
    expect(rejected.status).toBe(400);
    expect(await rejected.json()).toMatchObject({
      error: "invalid_redirect_uri",
    });
  });

  it("challenges a valid MCP token that lacks workspace claims", async () => {
    const identityOnlyClient = await registerCurrentMcpJamClient();
    const identityOnlyTokens = await authorizeClient(
      user,
      identityOnlyClient,
      "openid"
    );
    const result = await callMcp(
      identityOnlyTokens.access_token,
      97,
      "tools/list"
    );

    expect(result.response.status).toBe(401);
    expect(result.response.headers.get("WWW-Authenticate")).toBe(
      `Bearer resource_metadata="${AUTH_ORIGIN}/.well-known/oauth-protected-resource/mcp", scope="links:read links:write"`
    );
  });

  it("infers native for legacy local clients that omit application_type", async () => {
    const loopback = await registerClient({
      application_type: undefined,
      client_name: "Executor",
      redirect_uris: ["http://localhost:4789/api/oauth/callback"],
    });
    expect(loopback.status).toBe(201);
    expect(await loopback.json<RegisteredClient>()).toMatchObject({
      application_type: "native",
      token_endpoint_auth_method: "none",
    });
  });

  it("does not infer native for non-loopback or ambiguous redirects", async () => {
    for (const redirect_uris of [
      ["http://192.0.2.1/oauth/callback"],
      ["http://localhost.example.com/oauth/callback"],
      [
        "http://localhost:4789/api/oauth/callback",
        "https://client.example/oauth/callback",
      ],
    ]) {
      const response = await registerClient({
        application_type: undefined,
        redirect_uris,
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: "invalid_redirect_uri",
      });
    }
  });

  it("rejects oversized DCR and MCP bodies at the HTTP boundary", async () => {
    const registration = await SELF.fetch(
      "http://worker/api/auth/oauth2/register",
      {
        body: JSON.stringify({ client_name: "x".repeat(64 * 1024) }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      }
    );
    expect(registration.status).toBe(413);
    expect(await registration.json()).toMatchObject({
      error: "invalid_client_metadata",
    });

    const mcp = await SELF.fetch(MCP_RESOURCE, {
      body: "x".repeat(1024 * 1024 + 1),
      headers: { "Content-Type": "application/json", Origin: AUTH_ORIGIN },
      method: "POST",
    });
    expect(mcp.status).toBe(413);
    expect(mcp.headers.get("Access-Control-Allow-Origin")).toBe(AUTH_ORIGIN);
    expect(await mcp.json()).toMatchObject({
      error: { message: "MCP request body too large" },
    });
  });

  it("adds MCP CORS headers to rate-limit responses", async () => {
    const response = await workerFetch(
      new Request(MCP_RESOURCE, {
        headers: {
          "cf-connecting-ip": "192.0.2.10",
          Origin: AUTH_ORIGIN,
        },
        method: "POST",
      }) as never,
      {
        ...env,
        SYNC_RATE_LIMITER: { limit: async () => ({ success: false }) },
      } as never,
      {} as never
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      AUTH_ORIGIN
    );
  });

  it("binds consent when logged-out authorization resumes in the sign-in response", async () => {
    const email = "mcp-post-login@test.com";
    await signupUser(email, "MCP Post Login User");
    const isolatedClient = await registerCurrentMcpJamClient();
    const verifier =
      "mcp-jam-post-login-verifier-abcdefghijklmnopqrstuvwxyz-0123456789";
    const authorizeUrl = new URL("/api/auth/oauth2/authorize", AUTH_ORIGIN);
    authorizeUrl.search = new URLSearchParams({
      client_id: isolatedClient.client_id,
      code_challenge: await pkceChallenge(verifier),
      code_challenge_method: "S256",
      redirect_uri: REDIRECT_URI,
      resource: MCP_RESOURCE,
      response_type: "code",
      scope: SCOPES,
      state: "mcp-post-login-state",
    }).toString();

    const anonymousAuthorize = await SELF.fetch(
      workerUrl(authorizeUrl.toString()),
      { redirect: "manual" }
    );
    expect(anonymousAuthorize.status).toBe(302);
    const loginLocation = anonymousAuthorize.headers.get("location");
    expect(loginLocation).toBeTruthy();
    const loginUrl = new URL(loginLocation!, AUTH_ORIGIN);
    expect(loginUrl.pathname).toBe("/login");
    expect(loginUrl.searchParams.get("sig")).toBeTruthy();

    const signIn = await SELF.fetch("http://worker/api/auth/sign-in/email", {
      body: JSON.stringify({
        email,
        oauth_query: loginUrl.searchParams.toString(),
        password: "test-password-123",
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Origin: AUTH_ORIGIN,
      },
      method: "POST",
    });
    expect(signIn.status, await signIn.clone().text()).toBe(200);
    const signInBody = await signIn.json<{ redirect: boolean; url: string }>();
    expect(signInBody.redirect).toBe(true);
    const consentUrl = new URL(signInBody.url, AUTH_ORIGIN);
    expect(consentUrl.pathname).toBe("/oauth-consent");
    expect(consentUrl.searchParams.get("sig")).toBeTruthy();

    const signInSetCookies = signIn.headers.getSetCookie();
    const cookieNames = signInSetCookies.map(
      (cookie) => cookiePair(cookie).split("=", 1)[0]
    );
    expect(cookieNames).toContain("better-auth.session_token");
    expect(cookieNames).toContain("cloudstash_mcp_consent");

    const consent = await SELF.fetch("http://worker/api/auth/oauth2/consent", {
      body: JSON.stringify({
        accept: true,
        oauth_query: consentUrl.searchParams.toString(),
        scope: SCOPES,
      }),
      headers: {
        Cookie: mergeCookies(...signInSetCookies),
        "Content-Type": "application/json",
        Origin: AUTH_ORIGIN,
      },
      method: "POST",
    });
    expect(consent.status, await consent.clone().text()).toBe(200);
    const consentBody = await consent.json<{ url: string }>();
    const callback = new URL(consentBody.url);
    expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
    expect(callback.searchParams.get("state")).toBe("mcp-post-login-state");
    expect(callback.searchParams.get("code")).toBeTruthy();
  });

  it("rejects consent when the active workspace changes after authorization starts", async () => {
    const isolatedUser = await signupUser(
      "mcp-consent-switch@test.com",
      "MCP Consent Switch User"
    );
    const isolatedClient = await registerCurrentMcpJamClient();
    const prompt = await beginAuthorization(isolatedUser, isolatedClient);
    const authorizationCodesBefore = await env.DB.prepare(
      `SELECT COUNT(*) AS count FROM verification
       WHERE value LIKE '%"type":"authorization_code"%'`
    ).first<{ count: number }>();

    const otherOrgId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO organization (id, name, slug, tier) VALUES (?, ?, ?, 'pro')"
    )
      .bind(otherOrgId, "Switched Workspace", `switched-${otherOrgId}`)
      .run();
    await env.DB.prepare(
      "INSERT INTO member (id, organization_id, user_id, role) VALUES (?, ?, ?, 'owner')"
    )
      .bind(crypto.randomUUID(), otherOrgId, isolatedUser.userId)
      .run();

    const switched = await SELF.fetch(
      "http://worker/api/auth/organization/set-active",
      {
        body: JSON.stringify({ organizationId: otherOrgId }),
        headers: {
          Cookie: cookiePair(isolatedUser.cookie),
          "Content-Type": "application/json",
          Origin: AUTH_ORIGIN,
        },
        method: "POST",
      }
    );
    expect(switched.status, await switched.clone().text()).toBe(200);
    const switchedConsentCookie = mergeCookies(
      prompt.consentCookie,
      ...switched.headers.getSetCookie()
    );

    const rejected = await SELF.fetch("http://worker/api/auth/oauth2/consent", {
      body: JSON.stringify({
        accept: true,
        oauth_query: prompt.consentUrl.searchParams.toString(),
        scope: SCOPES,
      }),
      headers: {
        Cookie: switchedConsentCookie,
        "Content-Type": "application/json",
        Origin: AUTH_ORIGIN,
      },
      method: "POST",
    });
    expect(rejected.status).toBe(400);
    const rejection = await rejected.json<Record<string, unknown>>();
    expect(rejection).toMatchObject({
      error: "invalid_request",
      error_description:
        "Your Cloudstash account changed. Restart authorization and review the consent screen again.",
    });
    expect(rejection).not.toHaveProperty("url");

    const [authorizationCodesAfter, consentGrant] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM verification
         WHERE value LIKE '%"type":"authorization_code"%'`
      ).first<{ count: number }>(),
      env.DB.prepare(
        `SELECT COUNT(*) AS count FROM oauth_consent
         WHERE client_id = ? AND user_id = ?`
      )
        .bind(isolatedClient.client_id, isolatedUser.userId)
        .first<{ count: number }>(),
    ]);
    expect(authorizationCodesAfter?.count).toBe(
      authorizationCodesBefore?.count
    );
    expect(consentGrant?.count).toBe(0);
  });

  it("initializes, lists tools, and calls link tools through /mcp", async () => {
    const outboundStart = observedOutboundUrls.length;
    const initialize = await callMcp<{
      serverInfo: {
        icons: {
          mimeType?: string;
          sizes?: string[];
          src: string;
        }[];
        name: string;
        title?: string;
        websiteUrl?: string;
      };
    }>(tokens.access_token, 1, "initialize", {
      capabilities: {},
      clientInfo: { name: "MCP JAM", version: "test" },
      protocolVersion: "2025-11-25",
    });
    expect(
      initialize.response.status,
      `MCP initialize failed: ${JSON.stringify(initialize.body)}`
    ).toBe(200);
    expect(initialize.body.result?.serverInfo).toMatchObject({
      icons: [
        {
          mimeType: "image/png",
          sizes: ["192x192"],
          src: `${AUTH_ORIGIN}/logo192.png`,
        },
        {
          mimeType: "image/png",
          sizes: ["512x512"],
          src: `${AUTH_ORIGIN}/logo512.png`,
        },
      ],
      name: "cloudstash",
      title: "Cloudstash",
      websiteUrl: AUTH_ORIGIN,
    });

    const listed = await callMcp<{
      tools: {
        inputSchema: {
          properties?: Record<string, unknown>;
          type?: string;
        };
        name: string;
      }[];
    }>(tokens.access_token, 2, "tools/list");
    expect(listed.response.status).toBe(200);
    expect(listed.body.result?.tools.map(({ name }) => name)).toEqual([
      "list_links",
      "search_links",
      "get_link",
      "save_link",
      "update_link",
      "update_links",
    ]);
    const tools = listed.body.result?.tools ?? [];
    for (const tool of tools) {
      expect(tool.inputSchema.type, tool.name).toBe("object");
      expect(tool.inputSchema.properties, tool.name).toBeTypeOf("object");
    }
    const schemaFor = (name: string) =>
      JSON.stringify(tools.find((tool) => tool.name === name)?.inputSchema);
    expect(schemaFor("list_links")).toContain('"type":"integer"');
    expect(schemaFor("search_links")).toContain('"type":"string"');
    expect(schemaFor("search_links")).toContain('"match"');
    expect(schemaFor("save_link")).toContain('"format":"uri"');

    const searched = await callMcp<{ content: { text: string }[] }>(
      tokens.access_token,
      3,
      "tools/call",
      { arguments: { query: "nothing saved yet" }, name: "search_links" }
    );
    expect(searched.response.status).toBe(200);
    expect(
      JSON.parse(searched.body.result?.content[0]?.text ?? "null")
    ).toEqual([]);

    const saved = await callMcp<{ content: { text: string }[] }>(
      tokens.access_token,
      4,
      "tools/call",
      {
        arguments: { url: SAVED_LINK_URL },
        name: "save_link",
      }
    );
    expect(saved.response.status).toBe(200);
    const savedValue = JSON.parse(
      saved.body.result?.content[0]?.text ?? "null"
    ) as { link: { id: string } };
    expect(savedValue).toMatchObject({
      created: true,
      link: { tags: [], url: SAVED_LINK_URL },
    });

    const updated = await callMcp<{ content: { text: string }[] }>(
      tokens.access_token,
      5,
      "tools/call",
      {
        arguments: {
          id: savedValue.link.id,
          changes: { tags: { add: ["mcp"] } },
        },
        name: "update_link",
      }
    );
    expect(updated.response.status).toBe(200);
    expect(
      JSON.parse(updated.body.result?.content[0]?.text ?? "null")
    ).toMatchObject({ id: savedValue.link.id, tags: ["mcp"] });

    const completed = await callMcp<{ content: { text: string }[] }>(
      tokens.access_token,
      6,
      "tools/call",
      {
        arguments: {
          ids: [savedValue.link.id],
          changes: { state: "completed" },
        },
        name: "update_links",
      }
    );
    expect(completed.response.status).toBe(200);
    expect(
      JSON.parse(completed.body.result?.content[0]?.text ?? "null")
    ).toMatchObject({ updated: 1 });

    const overLimit = await callMcp<{
      content: { text: string }[];
      isError?: boolean;
    }>(tokens.access_token, 61, "tools/call", {
      arguments: {
        ids: [savedValue.link.id, "not-evaluated"],
        changes: { state: "completed" },
        limit: 1,
      },
      name: "update_links",
    });
    expect(overLimit.response.status).toBe(200);
    expect(overLimit.body.result?.isError).toBe(true);
    expect(overLimit.body.result?.content[0]?.text).toContain(
      "ids cannot contain more entries than limit"
    );

    const fetched = await callMcp<{ content: { text: string }[] }>(
      tokens.access_token,
      7,
      "tools/call",
      {
        arguments: { id: savedValue.link.id },
        name: "get_link",
      }
    );
    expect(fetched.response.status).toBe(200);
    expect(
      JSON.parse(fetched.body.result?.content[0]?.text ?? "null")
    ).toMatchObject({ id: savedValue.link.id, state: "completed" });

    const completedLinks = await callMcp<{ content: { text: string }[] }>(
      tokens.access_token,
      8,
      "tools/call",
      {
        arguments: { limit: 5, state: "completed" },
        name: "list_links",
      }
    );
    expect(completedLinks.response.status).toBe(200);
    expect(
      JSON.parse(completedLinks.body.result?.content[0]?.text ?? "null")
    ).toMatchObject({ links: [{ id: savedValue.link.id }], total: 1 });

    const archived = await callMcp<{ content: { text: string }[] }>(
      tokens.access_token,
      9,
      "tools/call",
      {
        arguments: {
          id: savedValue.link.id,
          changes: { state: "archive" },
        },
        name: "update_link",
      }
    );
    expect(archived.response.status).toBe(200);

    const anyTerm = await callMcp<{ content: { text: string }[] }>(
      tokens.access_token,
      10,
      "tools/call",
      {
        arguments: {
          query: "mcp definitely-absent",
          state: "any",
        },
        name: "search_links",
      }
    );
    expect(anyTerm.response.status).toBe(200);
    expect(
      JSON.parse(anyTerm.body.result?.content[0]?.text ?? "null")
    ).toMatchObject([{ id: savedValue.link.id, state: "archive" }]);

    const allTerms = await callMcp<{ content: { text: string }[] }>(
      tokens.access_token,
      11,
      "tools/call",
      {
        arguments: {
          match: "all",
          query: "mcp definitely-absent",
          state: "any",
        },
        name: "search_links",
      }
    );
    expect(allTerms.response.status).toBe(200);
    expect(
      JSON.parse(allTerms.body.result?.content[0]?.text ?? "null")
    ).toEqual([]);

    const fullHistory = await callMcp<{ content: { text: string }[] }>(
      tokens.access_token,
      12,
      "tools/call",
      {
        arguments: { limit: 5, state: "any" },
        name: "list_links",
      }
    );
    expect(fullHistory.response.status).toBe(200);
    expect(
      JSON.parse(fullHistory.body.result?.content[0]?.text ?? "null")
    ).toMatchObject({
      links: [{ id: savedValue.link.id, state: "archive" }],
      total: 1,
    });
    await vi.waitFor(
      () =>
        expect(observedOutboundUrls.slice(outboundStart)).toContain(
          SAVED_LINK_URL
        ),
      { timeout: 10_000 }
    );
    expect(new Set(observedOutboundUrls.slice(outboundStart))).toEqual(
      new Set([SAVED_LINK_URL])
    );
  });

  it("lists tools through the MCP 2026 per-request stateless transport", async () => {
    const listed = await callModernMcp<{
      resultType: string;
      tools: { name: string }[];
    }>(tokens.access_token, 5, "tools/list");

    expect(listed.response.status).toBe(200);
    expect(listed.response.headers.get("mcp-session-id")).toBeNull();
    expect(listed.body.result).toMatchObject({
      resultType: "complete",
      tools: [
        { name: "list_links" },
        { name: "search_links" },
        { name: "get_link" },
        { name: "save_link" },
        { name: "update_link" },
        { name: "update_links" },
      ],
    });
  });

  it("rejects a write tool when the token has only the read scope", async () => {
    const readOnlyUser = await signupUser(
      "mcp-read-only@test.com",
      "MCP Read Only User"
    );
    await env.DB.prepare("UPDATE organization SET tier = 'pro' WHERE id = ?")
      .bind(readOnlyUser.orgId)
      .run();
    const readOnlyClient = await registerCurrentMcpJamClient();
    const readOnlyTokens = await authorizeClient(
      readOnlyUser,
      readOnlyClient,
      "openid offline_access links:read"
    );

    const denied = await callMcp<unknown>(
      readOnlyTokens.access_token,
      20,
      "tools/call",
      { arguments: { url: SAVED_LINK_URL }, name: "save_link" }
    );

    expect(denied.response.status).toBe(403);
    expect(denied.response.headers.get("WWW-Authenticate")).toContain(
      'error="insufficient_scope"'
    );
    expect(denied.response.headers.get("WWW-Authenticate")).toContain(
      'scope="links:write"'
    );
  });

  it("keeps search and save pinned to the consented workspace after an active-workspace switch", async () => {
    const isolatedUser = await signupUser(
      "mcp-workspace-routing@test.com",
      "MCP Workspace Routing User"
    );
    await env.DB.prepare(
      "UPDATE organization SET tier = 'pro', feature_overrides = ? WHERE id = ?"
    )
      .bind(JSON.stringify({ aiSummary: false }), isolatedUser.orgId)
      .run();
    const otherOrgId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO organization (id, name, slug, tier) VALUES (?, ?, ?, 'pro')"
    )
      .bind(otherOrgId, "Other MCP Workspace", `other-mcp-${otherOrgId}`)
      .run();
    await env.DB.prepare(
      "INSERT INTO member (id, organization_id, user_id, role) VALUES (?, ?, ?, 'owner')"
    )
      .bind(crypto.randomUUID(), otherOrgId, isolatedUser.userId)
      .run();
    await env.DB.prepare(
      "UPDATE organization SET feature_overrides = ? WHERE id = ?"
    )
      .bind(JSON.stringify({ aiSummary: false }), otherOrgId)
      .run();
    await Promise.all([
      installTestMetadataFetcher(
        env.LINK_PROCESSOR_DO.get(
          env.LINK_PROCESSOR_DO.idFromName(isolatedUser.orgId)
        ),
        (url) => observedOutboundUrls.push(url)
      ),
      installTestMetadataFetcher(
        env.LINK_PROCESSOR_DO.get(env.LINK_PROCESSOR_DO.idFromName(otherOrgId)),
        (url) => observedOutboundUrls.push(url)
      ),
    ]);

    const isolatedClient = await registerCurrentMcpJamClient();
    const isolatedTokens = await authorizeClient(isolatedUser, isolatedClient);
    const switched = await SELF.fetch(
      "http://worker/api/auth/organization/set-active",
      {
        body: JSON.stringify({ organizationId: otherOrgId }),
        headers: {
          Cookie: cookiePair(isolatedUser.cookie),
          "Content-Type": "application/json",
          Origin: AUTH_ORIGIN,
        },
        method: "POST",
      }
    );
    expect(switched.status, await switched.clone().text()).toBe(200);

    const saved = await callMcp<unknown>(
      isolatedTokens.access_token,
      30,
      "tools/call",
      { arguments: { url: WORKSPACE_A_URL }, name: "save_link" }
    );
    expect(saved.response.status).toBe(200);
    await env.LINK_QUEUE.send({
      source: "test",
      sourceMeta: null,
      storeId: otherOrgId,
      url: WORKSPACE_B_URL,
    });

    const linksFor = async (orgId: string) => {
      const result = await env.LINK_PROCESSOR_DO.get(
        env.LINK_PROCESSOR_DO.idFromName(orgId)
      ).listLinks({ limit: 20, state: "active" });
      if (!result.ok) throw new Error(result.error.message);
      return result.value;
    };
    await vi.waitFor(
      async () => {
        const [workspaceA, workspaceB] = await Promise.all([
          linksFor(isolatedUser.orgId),
          linksFor(otherOrgId),
        ]);
        expect(workspaceA.links.map(({ url }) => url)).toContain(
          WORKSPACE_A_URL
        );
        expect(workspaceA.links.map(({ url }) => url)).not.toContain(
          WORKSPACE_B_URL
        );
        expect(workspaceB.links.map(({ url }) => url)).toContain(
          WORKSPACE_B_URL
        );
        expect(workspaceB.links.map(({ url }) => url)).not.toContain(
          WORKSPACE_A_URL
        );
      },
      { interval: 100, timeout: 10_000 }
    );

    const searched = await callMcp<{ content: { text: string }[] }>(
      isolatedTokens.access_token,
      31,
      "tools/call",
      {
        arguments: { query: "workspace-proof" },
        name: "search_links",
      }
    );
    expect(searched.response.status).toBe(200);
    const results = JSON.parse(
      searched.body.result?.content[0]?.text ?? "[]"
    ) as { url: string }[];
    expect(results.map(({ url }) => url)).toContain(WORKSPACE_A_URL);
    expect(results.map(({ url }) => url)).not.toContain(WORKSPACE_B_URL);
  });

  it("keeps refresh tokens bound to the consented workspace after a session workspace switch", async () => {
    const otherOrgId = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO organization (id, name, slug, tier) VALUES (?, ?, ?, 'plus')"
    )
      .bind(otherOrgId, "Other Workspace", `other-${otherOrgId}`)
      .run();
    await env.DB.prepare(
      "INSERT INTO member (id, organization_id, user_id, role) VALUES (?, ?, ?, 'owner')"
    )
      .bind(crypto.randomUUID(), otherOrgId, user.userId)
      .run();

    const switched = await SELF.fetch(
      "http://worker/api/auth/organization/set-active",
      {
        body: JSON.stringify({ organizationId: otherOrgId }),
        headers: {
          Cookie: cookiePair(user.cookie),
          "Content-Type": "application/json",
          Origin: AUTH_ORIGIN,
        },
        method: "POST",
      }
    );
    expect(switched.status, await switched.clone().text()).toBe(200);
    const switchedCookie = mergeCookies(
      user.cookie,
      ...switched.headers.getSetCookie()
    );
    const me = await SELF.fetch("http://worker/api/auth/me", {
      headers: { Cookie: switchedCookie },
    });
    expect(me.status).toBe(200);
    expect(
      (await me.json<{ session: { activeOrganizationId: string } }>()).session
        .activeOrganizationId
    ).toBe(otherOrgId);

    expect(tokens.refresh_token).toBeTruthy();
    const refreshed = await refreshClient(client, tokens.refresh_token!);
    expect(
      refreshed.status,
      `Refresh failed: ${await refreshed.clone().text()}`
    ).toBe(200);
    const refreshedTokens = await refreshed.json<TokenSet>();
    expect(refreshedTokens.scope.split(" ")).toEqual(
      expect.arrayContaining(SCOPES.split(" "))
    );
    expect(decodeJwtPayload(refreshedTokens.access_token)).toMatchObject({
      aud: expect.arrayContaining([MCP_RESOURCE]),
      client_id: client.client_id,
      iss: AUTH_ISSUER,
      sub: user.userId,
      [WORKSPACE_CLAIM]: user.orgId,
    });

    // The newly active Plus workspace is not MCP-entitled. Success proves the
    // refreshed token still authorizes the original consented Pro workspace.
    const listed = await callMcp<unknown>(
      refreshedTokens.access_token,
      5,
      "tools/list"
    );
    expect(listed.response.status).toBe(200);
  });

  it("rejects an access token with a tampered signature", async () => {
    const denied = await callMcp<unknown>(
      tamperJwtSignature(tokens.access_token),
      6,
      "tools/list"
    );
    expect(denied.response.status).toBe(401);
    expect(denied.response.headers.get("WWW-Authenticate")).toContain(
      `resource_metadata="${AUTH_ORIGIN}/.well-known/oauth-protected-resource/mcp"`
    );
  });

  it("rejects an expired signed access token", async () => {
    const shortLivedUser = await signupUser(
      "mcp-expired@test.com",
      "MCP Expired User"
    );
    await env.DB.prepare("UPDATE organization SET tier = 'pro' WHERE id = ?")
      .bind(shortLivedUser.orgId)
      .run();
    const policy = await env.DB.prepare(
      "SELECT access_token_ttl FROM oauth_resource WHERE identifier = ?"
    )
      .bind(MCP_RESOURCE)
      .first<{ access_token_ttl: number | null }>();
    expect(policy).not.toBeNull();

    try {
      await env.DB.prepare(
        "UPDATE oauth_resource SET access_token_ttl = 1 WHERE identifier = ?"
      )
        .bind(MCP_RESOURCE)
        .run();
      const shortLived = await authorizeClient(shortLivedUser, client);
      const claims = decodeJwtPayload(shortLived.access_token) as {
        exp: number;
        iat: number;
      };
      expect(claims.exp - claims.iat).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 1_100));

      const denied = await callMcp<unknown>(
        shortLived.access_token,
        7,
        "tools/list"
      );
      expect(denied.response.status).toBe(401);
    } finally {
      await env.DB.prepare(
        "UPDATE oauth_resource SET access_token_ttl = ? WHERE identifier = ?"
      )
        .bind(policy!.access_token_ttl, MCP_RESOURCE)
        .run();
    }
  });

  it("rejects refresh after the client revokes its refresh token", async () => {
    const revocationUser = await signupUser(
      "mcp-revocation@test.com",
      "MCP Revocation User"
    );
    await env.DB.prepare("UPDATE organization SET tier = 'pro' WHERE id = ?")
      .bind(revocationUser.orgId)
      .run();
    const revocationClient = await registerCurrentMcpJamClient();
    const refreshableTokens = await authorizeClient(
      revocationUser,
      revocationClient
    );
    expect(refreshableTokens.refresh_token).toBeTruthy();
    const revoked = await SELF.fetch("http://worker/api/auth/oauth2/revoke", {
      body: new URLSearchParams({
        client_id: revocationClient.client_id,
        token: refreshableTokens.refresh_token!,
        token_type_hint: "refresh_token",
      }),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    expect(revoked.status, await revoked.clone().text()).toBe(200);

    const refresh = await refreshClient(
      revocationClient,
      refreshableTokens.refresh_token!
    );
    expect(refresh.status).toBe(400);
    expect(await refresh.json()).toMatchObject({ error: "invalid_grant" });
  });

  it("rechecks Free and Plus workspace entitlements for an already-issued token", async () => {
    try {
      for (const [index, tier] of ["free", "plus"].entries()) {
        await env.DB.prepare("UPDATE organization SET tier = ? WHERE id = ?")
          .bind(tier, user.orgId)
          .run();
        const denied = await callMcp<unknown>(
          tokens.access_token,
          8 + index,
          "tools/list"
        );
        expect(denied.response.status).toBe(402);
      }
    } finally {
      await env.DB.prepare("UPDATE organization SET tier = 'pro' WHERE id = ?")
        .bind(user.orgId)
        .run();
    }
  });

  it("rejects an issued token after workspace membership is revoked", async () => {
    const revokedUser = await signupUser(
      "mcp-membership-revoked@test.com",
      "MCP Membership Revoked User"
    );
    await env.DB.prepare("UPDATE organization SET tier = 'pro' WHERE id = ?")
      .bind(revokedUser.orgId)
      .run();
    const revokedClient = await registerCurrentMcpJamClient();
    const revokedTokens = await authorizeClient(revokedUser, revokedClient);

    await env.DB.prepare(
      "DELETE FROM member WHERE user_id = ? AND organization_id = ?"
    )
      .bind(revokedUser.userId, revokedUser.orgId)
      .run();
    const denied = await callMcp<unknown>(
      revokedTokens.access_token,
      10,
      "tools/list"
    );
    expect(denied.response.status).toBe(403);
  });
});
