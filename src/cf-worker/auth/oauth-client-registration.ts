import { Effect, Option, Schema } from "effect";

const REGISTER_PATH = "/api/auth/oauth2/register";
export const MAX_REGISTRATION_BODY_BYTES = 64 * 1024;

const shortString = Schema.String.check(Schema.isMaxLength(512));
const uriString = Schema.String.check(Schema.isMaxLength(2048));
const shortStringArray = Schema.Array(shortString).check(
  Schema.isMaxLength(20)
);
const uriStringArray = Schema.Array(uriString).check(Schema.isMaxLength(20));

const OAuthClientRegistration = Schema.Struct({
  application_type: Schema.optional(Schema.Literals(["native", "web"])),
  client_name: Schema.optional(shortString),
  client_uri: Schema.optional(uriString),
  contacts: Schema.optional(shortStringArray),
  grant_types: Schema.optional(shortStringArray),
  jwks_uri: Schema.optional(uriString),
  logo_uri: Schema.optional(uriString),
  policy_uri: Schema.optional(uriString),
  post_logout_redirect_uris: Schema.optional(uriStringArray),
  redirect_uris: Schema.optional(uriStringArray),
  resources: Schema.optional(uriStringArray),
  response_types: Schema.optional(shortStringArray),
  scope: Schema.optional(Schema.String.check(Schema.isMaxLength(2048))),
  software_id: Schema.optional(shortString),
  software_statement: Schema.optional(
    Schema.String.check(Schema.isMaxLength(4096))
  ),
  software_version: Schema.optional(shortString),
  token_endpoint_auth_method: Schema.optional(shortString),
  tos_uri: Schema.optional(uriString),
});

const decodeRegistration = Schema.decodeUnknownOption(
  Schema.fromJsonString(OAuthClientRegistration)
);

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

export const validateOAuthClientRegistrationRequest = Effect.fn(
  "OAuth.validateClientRegistrationRequest"
)(function* (request: Request) {
  if (!isRegistrationRequest(request)) return null;

  const body = yield* Effect.tryPromise(() => request.clone().text()).pipe(
    Effect.option
  );
  if (Option.isNone(body)) return invalidOAuthClientRegistration();

  return Option.isSome(decodeRegistration(body.value))
    ? null
    : invalidOAuthClientRegistration();
});
