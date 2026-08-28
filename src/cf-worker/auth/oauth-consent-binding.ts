import { applySetCookies } from "better-auth/cookies";
import { Effect, Option, Schema } from "effect";

import type { Auth } from ".";
import type { Env } from "../shared";
import {
  CONSENT_ENDPOINT_PATH,
  CONSENT_PATH,
  bindingMatches,
  clearConsentBindingCookie,
  consentBindingCookie,
  makeConsentBinding,
  readConsentBinding,
} from "./oauth-consent-state";

const OAuthRedirect = Schema.Struct({
  redirect: Schema.Literal(true),
  url: Schema.NonEmptyString,
});
const ConsentSubmission = Schema.Struct({
  accept: Schema.Boolean,
  oauth_query: Schema.optional(Schema.String),
});

const decodeRedirect = Schema.decodeUnknownOption(OAuthRedirect);
const decodeSubmission = Schema.decodeUnknownOption(ConsentSubmission);

const redirectFrom = Effect.fn("OAuth.readRedirect")(function* (
  response: Response
) {
  const location = response.headers.get("location");
  if (location) return Option.some(location);
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return Option.none<string>();
  }

  const json = yield* Effect.tryPromise(() =>
    response.clone().json<unknown>()
  ).pipe(Effect.option);
  if (Option.isNone(json)) return Option.none<string>();
  return Option.map(decodeRedirect(json.value), ({ url }) => url);
});

const consentQueryFrom = Effect.fn("OAuth.readConsentQuery")(function* (
  response: Response,
  baseURL: string
) {
  const redirect = yield* redirectFrom(response);
  if (Option.isNone(redirect)) return Option.none<string>();

  const target = yield* Effect.try(() => new URL(redirect.value, baseURL)).pipe(
    Effect.option
  );
  if (Option.isNone(target)) return Option.none<string>();
  const base = new URL(baseURL);
  if (
    target.value.origin !== base.origin ||
    target.value.pathname !== CONSENT_PATH
  ) {
    return Option.none<string>();
  }
  return Option.some(target.value.searchParams.toString());
});

const sessionHeaders = (request: Request, response: Response): Headers => {
  const headers = new Headers(request.headers);
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) applySetCookies(headers, cookies);
  return headers;
};

const withCookie = (response: Response, cookie: string): Response => {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};

const rejectedConsent = (baseURL: string): Response =>
  Response.json(
    {
      error: "invalid_request",
      error_description:
        "Your Cloudstash account changed. Restart authorization and review the consent screen again.",
    },
    {
      headers: { "Set-Cookie": clearConsentBindingCookie(baseURL) },
      status: 400,
    }
  );

export const bindConsentWorkspace = Effect.fn("OAuth.bindConsentWorkspace")(
  function* (
    response: Response,
    request: Request,
    auth: Auth,
    env: Pick<Env, "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL">
  ) {
    const path = new URL(request.url).pathname;
    if (request.method === "POST" && path === CONSENT_ENDPOINT_PATH) {
      return withCookie(
        response,
        clearConsentBindingCookie(env.BETTER_AUTH_URL)
      );
    }

    const query = yield* consentQueryFrom(response, env.BETTER_AUTH_URL);
    if (Option.isNone(query)) return response;

    const session = yield* Effect.promise(() =>
      auth.api.getSession({ headers: sessionHeaders(request, response) })
    );
    const organizationId = session?.session.activeOrganizationId;
    if (!organizationId) return response;

    const value = yield* makeConsentBinding(
      organizationId,
      query.value,
      env.BETTER_AUTH_SECRET
    );
    return withCookie(
      response,
      consentBindingCookie(value, env.BETTER_AUTH_URL)
    );
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

  const body = yield* Effect.tryPromise(() =>
    request.clone().json<unknown>()
  ).pipe(Effect.option);
  if (Option.isNone(body)) return null;
  const submission = decodeSubmission(body.value);
  if (Option.isNone(submission) || !submission.value.accept) return null;

  const query = submission.value.oauth_query;
  if (!query) return rejectedConsent(env.BETTER_AUTH_URL);
  const [binding, session] = yield* Effect.all([
    readConsentBinding(request, env.BETTER_AUTH_SECRET),
    Effect.promise(() => auth.api.getSession({ headers: request.headers })),
  ]);
  const organizationId = session?.session.activeOrganizationId;
  if (
    Option.isNone(binding) ||
    !organizationId ||
    !(yield* bindingMatches(binding.value, organizationId, query))
  ) {
    return rejectedConsent(env.BETTER_AUTH_URL);
  }
  return null;
});
