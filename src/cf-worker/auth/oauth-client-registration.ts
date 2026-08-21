import { Effect, Option, Schema } from "effect";

const REGISTER_PATH = "/api/auth/oauth2/register";
export const MAX_REGISTRATION_BODY_BYTES = 64 * 1024;

const PublicClientRegistration = Schema.Struct({
  token_endpoint_auth_method: Schema.Literal("none"),
});
const decodePublicClient = Schema.decodeUnknownOption(PublicClientRegistration);

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

export const enforcePublicOAuthClientRegistration = Effect.fn(
  "OAuth.enforcePublicClientRegistration"
)(function* (request: Request) {
  if (!isRegistrationRequest(request)) return null;

  const body = yield* Effect.tryPromise(() =>
    request.clone().json<unknown>()
  ).pipe(Effect.option);
  if (Option.isNone(body)) return invalidOAuthClientRegistration();

  return Option.isSome(decodePublicClient(body.value))
    ? null
    : invalidOAuthClientRegistration();
});
