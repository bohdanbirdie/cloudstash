import { applySetCookies } from "better-auth/cookies";
import { constantTimeEqual, makeSignature } from "better-auth/crypto";
import { Effect, Option, Schema } from "effect";

import type { Auth } from ".";
import type { Env } from "../shared";

const CONSENT_BINDING_COOKIE = "cloudstash_mcp_consent";
const CONSENT_BINDING_LIFETIME_SECONDS = 10 * 60;
const CONSENT_PATH = "/oauth-consent";
const CONSENT_ENDPOINT_PATH = "/api/auth/oauth2/consent";

const ConsentBinding = Schema.Struct({
  expiresAt: Schema.Int,
  organizationId: Schema.NonEmptyString,
  queryHash: Schema.NonEmptyString,
});
type ConsentBinding = Schema.Schema.Type<typeof ConsentBinding>;

const OAuthRedirectResponse = Schema.Struct({
  redirect: Schema.Literal(true),
  url: Schema.NonEmptyString,
});

const ConsentSubmission = Schema.Struct({
  accept: Schema.Boolean,
  oauth_query: Schema.optional(Schema.String),
});

const decodeConsentBinding = Schema.decodeUnknownOption(ConsentBinding);
const decodeOAuthRedirect = Schema.decodeUnknownOption(OAuthRedirectResponse);
const decodeConsentSubmission = Schema.decodeUnknownOption(ConsentSubmission);

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

const decodePayload = Effect.fnUntraced(function* (value: string) {
  const parsed = yield* Effect.try({
    try: () => {
      const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
      const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
      const decoded = Uint8Array.from(atob(padded), (character) =>
        character.charCodeAt(0)
      );
      return JSON.parse(new TextDecoder().decode(decoded)) as unknown;
    },
    catch: () => undefined,
  }).pipe(Effect.option);
  return Option.isNone(parsed)
    ? Option.none<ConsentBinding>()
    : decodeConsentBinding(parsed.value);
});

const queryHash = Effect.fnUntraced(function* (query: string) {
  const digest = yield* Effect.promise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(query))
  );
  return encodeBase64Url(new Uint8Array(digest));
});

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

const signedOAuthQuery = Effect.fnUntraced(function* (
  search: string,
  secret: string
) {
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
  const expected = yield* Effect.promise(() =>
    makeSignature(canonicalizeOAuthQuery(signed), secret)
  );
  if (!constantTimeEqual(signature, expected)) return null;
  signed.append("sig", signature);
  return signed.toString();
});

const redirectUrlFromResponse = Effect.fnUntraced(function* (
  response: Response
) {
  const location = response.headers.get("location");
  if (location) return location;
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return null;
  }

  const body = yield* Effect.tryPromise({
    try: () => response.clone().json<unknown>(),
    catch: () => undefined,
  }).pipe(Effect.option);
  if (Option.isNone(body)) return null;
  const redirect = decodeOAuthRedirect(body.value);
  return Option.isSome(redirect) ? redirect.value.url : null;
});

const consentQueryFromResponse = Effect.fnUntraced(function* (
  response: Response,
  baseURL: string,
  secret: string
) {
  const redirectUrl = yield* redirectUrlFromResponse(response);
  if (!redirectUrl) return null;
  const urls = yield* Effect.try({
    try: () => ({
      base: new URL(baseURL),
      redirect: new URL(redirectUrl, baseURL),
    }),
    catch: () => undefined,
  }).pipe(Effect.option);
  if (Option.isNone(urls)) return null;
  if (
    urls.value.redirect.origin !== urls.value.base.origin ||
    urls.value.redirect.pathname !== CONSENT_PATH
  ) {
    return null;
  }
  return yield* signedOAuthQuery(urls.value.redirect.search, secret);
});

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

const cookieValue = Effect.fnUntraced(function* (
  payload: ConsentBinding,
  secret: string
) {
  const encoded = encodePayload(payload);
  const signature = yield* Effect.promise(() => makeSignature(encoded, secret));
  return `${encoded}.${signature}`;
});

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

const readBinding = Effect.fnUntraced(function* (
  request: Request,
  secret: string
) {
  const value = parseCookies(request.headers.get("cookie")).get(
    CONSENT_BINDING_COOKIE
  );
  if (!value) return Option.none<ConsentBinding>();
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return Option.none<ConsentBinding>();
  const encoded = value.slice(0, separator);
  const suppliedSignature = value.slice(separator + 1);
  const expectedSignature = yield* Effect.promise(() =>
    makeSignature(encoded, secret)
  );
  if (!constantTimeEqual(suppliedSignature, expectedSignature)) {
    return Option.none<ConsentBinding>();
  }
  return yield* decodePayload(encoded);
});

export const bindConsentWorkspace = Effect.fn("OAuth.bindConsentWorkspace")(
  function* (
    response: Response,
    request: Request,
    auth: Auth,
    env: Pick<Env, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL">
  ) {
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
    const oauthQuery = yield* consentQueryFromResponse(
      response,
      env.BETTER_AUTH_URL,
      env.BETTER_AUTH_SECRET
    );
    if (!oauthQuery) return response;
    const session = yield* Effect.promise(() =>
      auth.api.getSession({ headers: sessionHeaders(request, response) })
    );
    const organizationId = session?.session.activeOrganizationId;
    if (!organizationId) return response;

    const hash = yield* queryHash(oauthQuery);
    const expiresAt =
      Math.floor(Date.now() / 1000) + CONSENT_BINDING_LIFETIME_SECONDS;
    const value = yield* cookieValue(
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
  }
);

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

export const validateConsentWorkspaceBinding = Effect.fn(
  "OAuth.validateConsentWorkspaceBinding"
)(function* (
  request: Request,
  auth: Auth,
  env: Pick<Env, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL">
) {
  if (
    request.method !== "POST" ||
    new URL(request.url).pathname !== CONSENT_ENDPOINT_PATH
  ) {
    return null;
  }

  const rawBody = yield* Effect.tryPromise({
    try: () => request.clone().json<unknown>(),
    catch: () => undefined,
  }).pipe(Effect.option);
  if (Option.isNone(rawBody)) return null;
  const submission = decodeConsentSubmission(rawBody.value);
  if (Option.isNone(submission) || !submission.value.accept) {
    return null;
  }
  if (submission.value.oauth_query === undefined) {
    return rejection(env);
  }

  const hash = yield* queryHash(submission.value.oauth_query);
  const [binding, session] = yield* Effect.all([
    readBinding(request, env.BETTER_AUTH_SECRET),
    Effect.promise(() => auth.api.getSession({ headers: request.headers })),
  ]);
  if (
    Option.isNone(binding) ||
    binding.value.expiresAt < Math.floor(Date.now() / 1000) ||
    !session?.session.activeOrganizationId ||
    binding.value.organizationId !== session.session.activeOrganizationId ||
    binding.value.queryHash !== hash
  ) {
    return rejection(env);
  }

  return null;
});
