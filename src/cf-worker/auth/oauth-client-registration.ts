import { count } from "drizzle-orm";
import { Effect, Option, Schema } from "effect";

import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import { readRequestBody } from "../http/request-body";

const REGISTER_PATH = "/api/auth/oauth2/register";
const MAX_REGISTRATION_BODY_BYTES = 64 * 1024;
const DCR_GROWTH_WARNING_COUNT = 10_000;

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

const invalidRegistration = (status = 400): Response =>
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

  const body = yield* readRequestBody(
    request,
    MAX_REGISTRATION_BODY_BYTES
  ).pipe(
    Effect.match({
      onFailure: (error) =>
        error._tag === "RequestBodyTooLargeError"
          ? invalidRegistration(413)
          : invalidRegistration(),
      onSuccess: (value) => value,
    })
  );
  if (body instanceof Response) return body;

  return Option.isSome(decodeRegistration(body)) ? null : invalidRegistration();
});

export const monitorOAuthClientGrowth = Effect.fn("OAuth.monitorClientGrowth")(
  function* (request: Request, response: Response) {
    if (!isRegistrationRequest(request) || response.status !== 201) return;

    const db = yield* DbClient;
    const [row] = yield* query(
      db.select({ count: count() }).from(schema.oauthClient)
    ).pipe(
      Effect.catchTag("DbError", (error) =>
        Effect.logError("OAuth DCR growth check failed").pipe(
          Effect.annotateLogs({ errorType: error._tag }),
          Effect.as([])
        )
      )
    );
    if (!row) return;

    const log =
      row.count >= DCR_GROWTH_WARNING_COUNT
        ? Effect.logWarning("OAuth DCR client table growth threshold reached")
        : Effect.logInfo("OAuth DCR client registered");
    yield* log.pipe(Effect.annotateLogs({ oauthClientCount: row.count }));
  }
);
