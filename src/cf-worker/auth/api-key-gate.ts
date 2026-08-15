import { Effect, Option, Schema } from "effect";

import { capabilityDeniedResponse } from "../billing/errors";
import { requireCapability } from "../billing/service";
import { SessionLookupError } from "../connect/errors";
import { maskId, safeErrorInfo } from "../log-utils";
import { AuthClient } from "./service";
import { WorkspaceAccess } from "./workspace-access";
import { workspaceAccessHttpResponse } from "./workspace-access-http";

const ApiKeyMutationRoute = Schema.Literals([
  "/api/auth/api-key/create",
  "/api/auth/api-key/update",
]);
const ApiKeyMutationBody = Schema.Record(Schema.String, Schema.Unknown);
const MetadataMutation = Schema.Struct({ metadata: Schema.Unknown });

const decodeRoute = Schema.decodeUnknownOption(ApiKeyMutationRoute);
const decodeBody = Schema.decodeUnknownEffect(ApiKeyMutationBody);
const containsMetadata = Schema.is(MetadataMutation);

/**
 * Owns browser API-key create scope and blocks browser metadata updates.
 * Returns `null` only for unrelated Better Auth routes or safe key updates.
 *
 * Server-side callers (`auth.api.createApiKey(...)` from connect handlers)
 * bypass this HTTP route and provide their own server-selected scope.
 */
export const gateUserApiKeyCreate = Effect.fn("Auth.gateUserApiKeyCreate")(
  function* (request: Request) {
    if (request.method !== "POST") return null;
    const route = decodeRoute(new URL(request.url).pathname);
    if (Option.isNone(route)) return null;

    const bodyOption = yield* Effect.tryPromise(() =>
      request.clone().json<unknown>()
    ).pipe(Effect.flatMap(decodeBody), Effect.option);

    if (route.value === "/api/auth/api-key/update") {
      return Option.isSome(bodyOption) && containsMetadata(bodyOption.value)
        ? Response.json(
            { error: "API key workspace scope is immutable" },
            { status: 400 }
          )
        : null;
    }

    const workspaceAccess = yield* WorkspaceAccess;
    const authorization = yield* workspaceAccess
      .authorizeSession(request.headers)
      .pipe(
        Effect.matchEffect({
          onFailure: (error) =>
            workspaceAccessHttpResponse(error, {
              missingScope: () =>
                Response.json(
                  { error: "No active organization" },
                  { status: 400 }
                ),
            }),
          onSuccess: Effect.succeed,
        })
      );
    if (authorization instanceof Response) return authorization;
    const { orgId } = authorization;

    const denied = yield* requireCapability(orgId, "publicApi").pipe(
      Effect.as<Response | null>(null),
      Effect.catchTags({
        CapabilityDisabledError: (e) =>
          Effect.succeed(capabilityDeniedResponse(e)),
        OrgNotFoundError: () =>
          Effect.succeed(
            Response.json({ error: "Organization not found" }, { status: 404 })
          ),
        DbError: (cause) =>
          Effect.logError("Auth.gateUserApiKeyCreate DbError").pipe(
            Effect.annotateLogs({
              orgId: maskId(orgId),
              cause: String(cause),
            }),
            Effect.as(
              Response.json({ error: "Internal error" }, { status: 500 })
            )
          ),
      })
    );
    if (denied) return denied;

    if (Option.isNone(bodyOption)) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const auth = yield* AuthClient;
    const headers = new Headers(request.headers);
    headers.set("content-type", "application/json");
    const scopedRequest = new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify({
        ...bodyOption.value,
        metadata: { orgId, source: "api" },
      }),
    });
    return yield* Effect.tryPromise({
      try: () => auth.handler(scopedRequest),
      catch: (cause) => new SessionLookupError({ cause }),
    });
  },
  (effect) =>
    effect.pipe(
      Effect.catchTags({
        SessionLookupError: (e) =>
          Effect.logError("Auth API key mutation failed").pipe(
            Effect.annotateLogs(safeErrorInfo(e.cause)),
            Effect.as<Response | null>(
              Response.json(
                { error: "Auth backend unavailable" },
                { status: 503 }
              )
            )
          ),
      })
    )
);
