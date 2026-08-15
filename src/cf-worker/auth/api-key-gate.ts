import { Effect, Option } from "effect";

import { capabilityDeniedResponse } from "../billing/errors";
import { requireCapability } from "../billing/service";
import { SessionLookupError } from "../connect/errors";
import { maskId, safeErrorInfo } from "../log-utils";
import { AuthClient } from "./service";
import { WorkspaceAccess } from "./workspace-access";

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
    const { pathname } = new URL(request.url);
    const isCreate = pathname === "/api/auth/api-key/create";
    const isUpdate = pathname === "/api/auth/api-key/update";
    if (!isCreate && !isUpdate) return null;

    const bodyOption = yield* Effect.tryPromise(() =>
      request.clone().json<unknown>()
    ).pipe(Effect.option);

    if (isUpdate) {
      if (
        Option.isSome(bodyOption) &&
        typeof bodyOption.value === "object" &&
        bodyOption.value !== null &&
        Object.hasOwn(bodyOption.value, "metadata")
      ) {
        return Response.json(
          { error: "API key workspace scope is immutable" },
          { status: 400 }
        );
      }
      return null;
    }

    const workspaceAccess = yield* WorkspaceAccess;
    const { orgId } = yield* workspaceAccess.authorize({
      _tag: "Session",
      headers: request.headers,
    });

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

    if (
      Option.isNone(bodyOption) ||
      typeof bodyOption.value !== "object" ||
      bodyOption.value === null ||
      Array.isArray(bodyOption.value)
    ) {
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
        WorkspaceCredentialInvalidError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
        WorkspaceScopeMissingError: () =>
          Effect.succeed(
            Response.json({ error: "No active organization" }, { status: 400 })
          ),
        WorkspaceScopeMismatchError: () =>
          Effect.succeed(
            Response.json({ error: "Access denied" }, { status: 403 })
          ),
        WorkspaceUserUnapprovedError: () =>
          Effect.succeed(
            Response.json(
              { error: "Account pending approval" },
              { status: 403 }
            )
          ),
        WorkspaceMembershipRevokedError: () =>
          Effect.succeed(
            Response.json({ error: "Access denied" }, { status: 403 })
          ),
        WorkspaceApiKeyReferenceMissingError: () =>
          Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          ),
        WorkspaceAccessBackendError: (e) =>
          Effect.logError("Auth API key workspace lookup failed").pipe(
            Effect.annotateLogs({
              operation: e.operation,
              ...safeErrorInfo(e.cause),
            }),
            Effect.as<Response | null>(
              Response.json(
                { error: "Auth backend unavailable" },
                { status: 503 }
              )
            )
          ),
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
