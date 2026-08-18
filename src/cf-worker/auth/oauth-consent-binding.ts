import { applySetCookies } from "better-auth/cookies";
import { constantTimeEqual, makeSignature } from "better-auth/crypto";

import type { Auth } from ".";
import type { Env } from "../shared";

const CONSENT_BINDING_COOKIE = "cloudstash_mcp_consent";
const CONSENT_BINDING_LIFETIME_SECONDS = 10 * 60;
const CONSENT_PATH = "/oauth-consent";
const CONSENT_ENDPOINT_PATH = "/api/auth/oauth2/consent";

type ConsentBinding = {
  readonly expiresAt: number;
  readonly organizationId: string;
  readonly queryHash: string;
};

const encodeBase64Url = (bytes: Uint8Array): string => {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
};

const encodePayload = (payload: ConsentBinding): string =>
  encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));

const decodePayload = (value: string): ConsentBinding | null => {
  try {
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const decoded = Uint8Array.from(atob(padded), (character) =>
      character.charCodeAt(0)
    );
    const parsed: unknown = JSON.parse(new TextDecoder().decode(decoded));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("expiresAt" in parsed) ||
      !("organizationId" in parsed) ||
      !("queryHash" in parsed) ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.organizationId !== "string" ||
      typeof parsed.queryHash !== "string"
    ) {
      return null;
    }
    return parsed as ConsentBinding;
  } catch {
    return null;
  }
};

const queryHash = async (query: string): Promise<string> =>
  encodeBase64Url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(query))
    )
  );

const canonicalizeOAuthQuery = (params: URLSearchParams): string => {
  const canonical = new URLSearchParams();
  const entries = [...params.entries()].toSorted(
    ([keyA, valueA], [keyB, valueB]) =>
      keyA < keyB
        ? -1
        : keyA > keyB
          ? 1
          : valueA < valueB
            ? -1
            : valueA > valueB
              ? 1
              : 0
  );
  for (const [key, value] of entries) canonical.append(key, value);
  return canonical.toString();
};

const signedOAuthQuery = async (
  search: string,
  secret: string
): Promise<string | null> => {
  const params = new URLSearchParams(search);
  const signatures = params.getAll("sig");
  if (signatures.length !== 1 || !signatures[0]) return null;
  const signedNames = new Set(params.getAll("ba_param"));
  if (signedNames.size === 0) return null;

  const signed = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key === "sig" || key === "ba_param" || signedNames.has(key)) {
      signed.append(key, value);
    }
  }
  const signature = signed.get("sig");
  const expiresAt = Number(signed.get("exp"));
  signed.delete("sig");
  if (
    !signature ||
    !Number.isFinite(expiresAt) ||
    expiresAt * 1000 < Date.now()
  ) {
    return null;
  }
  const expected = await makeSignature(canonicalizeOAuthQuery(signed), secret);
  if (!constantTimeEqual(signature, expected)) return null;
  signed.append("sig", signature);
  return signed.toString();
};

const redirectUrlFromResponse = async (
  response: Response
): Promise<string | null> => {
  const location = response.headers.get("location");
  if (location) return location;
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return null;
  }

  const body: unknown = await response
    .clone()
    .json()
    .catch(() => null);
  if (
    typeof body !== "object" ||
    body === null ||
    !("redirect" in body) ||
    body.redirect !== true ||
    !("url" in body) ||
    typeof body.url !== "string"
  ) {
    return null;
  }
  return body.url;
};

const consentQueryFromResponse = async (
  response: Response,
  baseURL: string,
  secret: string
): Promise<string | null> => {
  const redirectUrl = await redirectUrlFromResponse(response);
  if (!redirectUrl) return null;
  try {
    const url = new URL(redirectUrl, baseURL);
    if (
      url.origin !== new URL(baseURL).origin ||
      url.pathname !== CONSENT_PATH
    ) {
      return null;
    }
    return signedOAuthQuery(url.search, secret);
  } catch {
    return null;
  }
};

const sessionHeaders = (request: Request, response: Response): Headers => {
  const headers = new Headers(request.headers);
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) applySetCookies(headers, setCookies);
  else {
    const combined = response.headers.get("set-cookie");
    if (combined) applySetCookies(headers, [combined]);
  }
  return headers;
};

const cookieValue = async (
  payload: ConsentBinding,
  secret: string
): Promise<string> => {
  const encoded = encodePayload(payload);
  return `${encoded}.${await makeSignature(encoded, secret)}`;
};

const cookieAttributes = (baseURL: string): string =>
  [
    `Path=${CONSENT_ENDPOINT_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(new URL(baseURL).protocol === "https:" ? ["Secure"] : []),
  ].join("; ");

const parseCookies = (header: string | null): Map<string, string> => {
  const cookies = new Map<string, string>();
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1));
  }
  return cookies;
};

const readBinding = async (
  request: Request,
  secret: string
): Promise<ConsentBinding | null> => {
  const value = parseCookies(request.headers.get("cookie")).get(
    CONSENT_BINDING_COOKIE
  );
  if (!value) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const encoded = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  const expectedSignature = await makeSignature(encoded, secret);
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) return null;
  return decodePayload(encoded);
};

export const bindConsentWorkspace = async (
  response: Response,
  request: Request,
  auth: Auth,
  env: Pick<Env, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL">
): Promise<Response> => {
  const requestPath = new URL(request.url).pathname;
  if (request.method === "POST" && requestPath === CONSENT_ENDPOINT_PATH) {
    const headers = new Headers(response.headers);
    headers.append(
      "Set-Cookie",
      `${CONSENT_BINDING_COOKIE}=; Max-Age=0; ${cookieAttributes(env.BETTER_AUTH_URL)}`
    );
    return new Response(response.body, {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  }
  const oauthQuery = await consentQueryFromResponse(
    response,
    env.BETTER_AUTH_URL,
    env.BETTER_AUTH_SECRET
  );
  if (!oauthQuery) return response;
  const session = await auth.api.getSession({
    headers: sessionHeaders(request, response),
  });
  const organizationId = session?.session.activeOrganizationId;
  if (!organizationId) return response;

  const hash = await queryHash(oauthQuery);
  const expiresAt =
    Math.floor(Date.now() / 1000) + CONSENT_BINDING_LIFETIME_SECONDS;
  const value = await cookieValue(
    { expiresAt, organizationId, queryHash: hash },
    env.BETTER_AUTH_SECRET
  );
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `${CONSENT_BINDING_COOKIE}=${value}; Max-Age=${CONSENT_BINDING_LIFETIME_SECONDS}; ${cookieAttributes(env.BETTER_AUTH_URL)}`
  );
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

const rejection = (env: Pick<Env, "BETTER_AUTH_URL">): Response =>
  Response.json(
    {
      error: "invalid_request",
      error_description:
        "The active workspace changed. Restart authorization and review the consent screen again.",
    },
    {
      headers: {
        "Set-Cookie": `${CONSENT_BINDING_COOKIE}=; Max-Age=0; ${cookieAttributes(env.BETTER_AUTH_URL)}`,
      },
      status: 400,
    }
  );

export const validateConsentWorkspaceBinding = async (
  request: Request,
  auth: Auth,
  env: Pick<Env, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL">
): Promise<Response | null> => {
  if (
    request.method !== "POST" ||
    new URL(request.url).pathname !== CONSENT_ENDPOINT_PATH
  ) {
    return null;
  }

  const body: unknown = await request
    .clone()
    .json()
    .catch(() => null);
  if (
    typeof body !== "object" ||
    body === null ||
    !("accept" in body) ||
    body.accept !== true
  ) {
    return null;
  }
  if (!("oauth_query" in body) || typeof body.oauth_query !== "string") {
    return rejection(env);
  }

  const hash = await queryHash(body.oauth_query);
  const [binding, session] = await Promise.all([
    readBinding(request, env.BETTER_AUTH_SECRET),
    auth.api.getSession({ headers: request.headers }),
  ]);
  if (
    !binding ||
    binding.expiresAt < Math.floor(Date.now() / 1000) ||
    !session?.session.activeOrganizationId ||
    binding.organizationId !== session.session.activeOrganizationId ||
    binding.queryHash !== hash
  ) {
    return rejection(env);
  }

  return null;
};
