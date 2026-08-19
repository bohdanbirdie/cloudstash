import { parseCookies } from "better-auth/cookies";
import {
  constantTimeEqual,
  makeSignature,
  symmetricDecrypt,
  symmetricEncrypt,
} from "better-auth/crypto";
import { Clock, Effect, Option, Schema } from "effect";

export const CONSENT_BINDING_COOKIE = "cloudstash_mcp_consent";
export const CONSENT_ENDPOINT_PATH = "/api/auth/oauth2/consent";
export const CONSENT_PATH = "/oauth-consent";

const CONSENT_BINDING_LIFETIME_SECONDS = 10 * 60;

const ConsentBinding = Schema.Struct({
  expiresAt: Schema.Int,
  organizationId: Schema.NonEmptyString,
  queryHash: Schema.NonEmptyString,
});
type ConsentBinding = typeof ConsentBinding.Type;

const ConsentBindingJson = Schema.fromJsonString(ConsentBinding);
const decodeBinding = Schema.decodeUnknownEffect(ConsentBindingJson);

export const canonicalizeOAuthQuery = (params: URLSearchParams): string => {
  const canonical = new URLSearchParams();
  for (const [key, value] of [...params.entries()].toSorted(
    ([keyA, valueA], [keyB, valueB]) => {
      if (keyA < keyB) return -1;
      if (keyA > keyB) return 1;
      if (valueA < valueB) return -1;
      if (valueA > valueB) return 1;
      return 0;
    }
  )) {
    canonical.append(key, value);
  }
  return canonical.toString();
};

export const verifySignedOAuthQuery = Effect.fn("OAuth.verifySignedQuery")(
  function* (search: string, secret: string) {
    const params = new URLSearchParams(search);
    const signatures = params.getAll("sig");
    const signature = signatures[0];
    const expiresAt = Number(params.get("exp"));
    params.delete("sig");
    if (signatures.length !== 1 || !signature || !Number.isFinite(expiresAt)) {
      return Option.none<string>();
    }

    const now = yield* Clock.currentTimeMillis;
    if (expiresAt * 1_000 < now) return Option.none<string>();
    const expected = yield* Effect.promise(() =>
      makeSignature(canonicalizeOAuthQuery(params), secret)
    );
    return constantTimeEqual(signature, expected)
      ? Option.some(new URLSearchParams(search).toString())
      : Option.none<string>();
  }
);

const hashQuery = Effect.fn("OAuth.hashConsentQuery")(function* (
  query: string
) {
  const digest = yield* Effect.promise(() =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(query))
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
});

export const makeConsentBinding = Effect.fn("OAuth.makeConsentBinding")(
  function* (organizationId: string, query: string, secret: string) {
    const now = yield* Clock.currentTimeMillis;
    const queryHash = yield* hashQuery(query);
    return yield* Effect.promise(() =>
      symmetricEncrypt({
        key: secret,
        data: JSON.stringify({
          expiresAt: Math.floor(now / 1_000) + CONSENT_BINDING_LIFETIME_SECONDS,
          organizationId,
          queryHash,
        } satisfies ConsentBinding),
      })
    );
  }
);

export const readConsentBinding = Effect.fn("OAuth.readConsentBinding")(
  function* (request: Request, secret: string) {
    const value = parseCookies(request.headers.get("cookie") ?? "").get(
      CONSENT_BINDING_COOKIE
    );
    if (!value) return Option.none<ConsentBinding>();

    return yield* Effect.tryPromise(() =>
      symmetricDecrypt({ key: secret, data: value })
    ).pipe(Effect.flatMap(decodeBinding), Effect.option);
  }
);

export const bindingMatches = Effect.fn("OAuth.bindingMatches")(function* (
  binding: ConsentBinding,
  organizationId: string,
  query: string
) {
  const [now, queryHash] = yield* Effect.all([
    Clock.currentTimeMillis,
    hashQuery(query),
  ]);
  return (
    binding.expiresAt >= Math.floor(now / 1_000) &&
    binding.organizationId === organizationId &&
    binding.queryHash === queryHash
  );
});

const cookieAttributes = (baseURL: string): string =>
  [
    `Path=${CONSENT_ENDPOINT_PATH}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(new URL(baseURL).protocol === "https:" ? ["Secure"] : []),
  ].join("; ");

export const consentBindingCookie = (value: string, baseURL: string): string =>
  `${CONSENT_BINDING_COOKIE}=${value}; Max-Age=${CONSENT_BINDING_LIFETIME_SECONDS}; ${cookieAttributes(baseURL)}`;

export const clearConsentBindingCookie = (baseURL: string): string =>
  `${CONSENT_BINDING_COOKIE}=; Max-Age=0; ${cookieAttributes(baseURL)}`;
