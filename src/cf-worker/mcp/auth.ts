import { Data, Effect, Option, Schema } from "effect";
import type { JWTPayload } from "jose";

import { WorkspaceAccess } from "../auth/workspace-access";
import type { WorkspaceAccessDeniedError } from "../auth/workspace-access";
import { requireCapability } from "../billing/service";
import { OrgId, UserId } from "../db/branded";
import { MCP_WORKSPACE_CLAIM } from "./config";

const McpAccessTokenClaims = Schema.Struct({
  sub: Schema.String,
  client_id: Schema.String,
  scope: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
  exp: Schema.optional(Schema.Number),
  [MCP_WORKSPACE_CLAIM]: Schema.String,
});

const decodeClaims = Schema.decodeUnknownEffect(McpAccessTokenClaims);

export const McpAuthorization = Schema.Struct({
  clientId: Schema.String,
  expiresAt: Schema.optional(Schema.Number),
  orgId: OrgId,
  scopes: Schema.Array(Schema.String),
  userId: UserId,
});
export type McpAuthorization = typeof McpAuthorization.Type;

export class McpAuthorizationBackendError extends Data.TaggedError(
  "McpAuthorizationBackendError"
)<{ readonly cause: unknown }> {}

export class McpInvalidClaimsError extends Data.TaggedError(
  "McpInvalidClaimsError"
)<{}> {}

export class McpWorkspaceAccessDenied extends Data.TaggedError(
  "McpWorkspaceAccessDenied"
)<{ readonly cause: WorkspaceAccessDeniedError }> {}

export const authorizeMcpClaims = Effect.fnUntraced(function* (
  claims: JWTPayload
) {
  const decoded = yield* decodeClaims(claims).pipe(Effect.option);
  if (Option.isNone(decoded)) return yield* new McpInvalidClaimsError();

  const raw = decoded.value;
  if (
    raw.sub.length === 0 ||
    raw.client_id.length === 0 ||
    raw[MCP_WORKSPACE_CLAIM].length === 0
  ) {
    return yield* new McpInvalidClaimsError();
  }

  const authorization: McpAuthorization = {
    clientId: raw.client_id,
    expiresAt: raw.exp,
    orgId: OrgId.make(raw[MCP_WORKSPACE_CLAIM]),
    scopes:
      typeof raw.scope === "string"
        ? raw.scope.split(" ").filter(Boolean)
        : [...raw.scope],
    userId: UserId.make(raw.sub),
  };

  const workspaceAccess = yield* WorkspaceAccess;
  yield* workspaceAccess
    .authorizeIdentity(authorization)
    .pipe(
      Effect.mapError((error) =>
        error._tag === "WorkspaceAccessBackendError"
          ? new McpAuthorizationBackendError({ cause: error.cause })
          : new McpWorkspaceAccessDenied({ cause: error })
      )
    );

  yield* requireCapability(authorization.orgId, "mcpServer");

  return authorization;
});
