import { Effect, Option, Schema } from "effect";

const REGISTER_PATH = "/api/auth/oauth2/register";
export const MAX_REGISTRATION_BODY_BYTES = 64 * 1024;

const RegistrationBody = Schema.Record(Schema.String, Schema.Unknown);
const PublicClientRegistration = Schema.Struct({
  token_endpoint_auth_method: Schema.Literal("none"),
});
const RedirectUris = Schema.Array(Schema.String);

const decodeRegistrationBody = Schema.decodeUnknownOption(RegistrationBody);
const decodePublicClient = Schema.decodeUnknownOption(PublicClientRegistration);
const decodeRedirectUris = Schema.decodeUnknownOption(RedirectUris);

export const invalidOAuthClientRegistration = (status = 400): Response =>
  Response.json(
    {
      error: "invalid_client_metadata",
      error_description:
        status === 413
          ? "Client registration request is too large"
          : "Client registration metadata is invalid",
    },
    { status }
  );

const isRegistrationRequest = (request: Request): boolean =>
  request.method === "POST" && new URL(request.url).pathname === REGISTER_PATH;

const isExactHttpLoopbackRedirect = (redirectUri: string): boolean => {
  const parsed = Option.liftThrowable((value: string) => new URL(value))(
    redirectUri
  );
  if (Option.isNone(parsed) || parsed.value.protocol !== "http:") return false;

  return ["localhost", "127.0.0.1", "[::1]"].includes(
    parsed.value.hostname.toLowerCase()
  );
};

const shouldInferNativeApplication = (
  body: Record<string, unknown>
): boolean => {
  if (body.application_type !== undefined) return false;
  const redirectUris = decodeRedirectUris(body.redirect_uris);
  return (
    Option.isSome(redirectUris) &&
    redirectUris.value.length > 0 &&
    redirectUris.value.every(isExactHttpLoopbackRedirect)
  );
};

const withJsonBody = (
  request: Request,
  body: Record<string, unknown>
): Request => {
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  headers.delete("content-length");
  return new Request(request.url, {
    body: JSON.stringify(body),
    headers,
    method: request.method,
  });
};

export const preparePublicOAuthClientRegistration = Effect.fn(
  "OAuth.preparePublicClientRegistration"
)(function* (request: Request) {
  if (!isRegistrationRequest(request)) return request;

  const bodyOption = yield* Effect.tryPromise(() =>
    request.clone().json<unknown>()
  ).pipe(Effect.map(decodeRegistrationBody), Effect.option);
  const body = Option.flatten(bodyOption);
  if (Option.isNone(body)) return invalidOAuthClientRegistration();

  if (Option.isNone(decodePublicClient(body.value))) {
    return invalidOAuthClientRegistration();
  }

  return shouldInferNativeApplication(body.value)
    ? withJsonBody(request, { ...body.value, application_type: "native" })
    : request;
});
