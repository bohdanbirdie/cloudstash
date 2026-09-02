import { Data, Effect, Option, Schema } from "effect";
import type { JWTPayload } from "jose";

import {
  WorkspaceAccess,
  matchWorkspaceAccessError,
} from "../auth/workspace-access";
import type { WorkspaceAccessDeniedError } from "../auth/workspace-access";
import { externalCallAllowance } from "../billing/external-call-meter";
import { requireCapability } from "../billing/service";
import { OrgId, UserId } from "../db/branded";
import type { Env } from "../shared";
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
  externalCallAllowance: Schema.Struct({
    limit: Schema.Int,
    resetsAt: Schema.String,
    usageWindowId: Schema.String,
  }),
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
  claims: JWTPayload,
  env: Env
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

  const identity = {
    clientId: raw.client_id,
    expiresAt: raw.exp,
    orgId: OrgId.make(raw[MCP_WORKSPACE_CLAIM]),
    scopes:
      typeof raw.scope === "string"
        ? raw.scope.split(" ").filter(Boolean)
        : [...raw.scope],
    userId: UserId.make(raw.sub),
  } satisfies Omit<McpAuthorization, "externalCallAllowance">;

  const workspaceAccess = yield* WorkspaceAccess;
  yield* workspaceAccess.authorizeIdentity(identity).pipe(
    Effect.mapError((error) =>
      matchWorkspaceAccessError<
        McpAuthorizationBackendError | McpWorkspaceAccessDenied
      >(error, {
        unauthorized: (cause) => new McpWorkspaceAccessDenied({ cause }),
        missingScope: (cause) => new McpWorkspaceAccessDenied({ cause }),
        forbidden: (cause) => new McpWorkspaceAccessDenied({ cause }),
        backend: ({ cause }) => new McpAuthorizationBackendError({ cause }),
      })
    )
  );

  yield* requireCapability(identity.orgId, "mcpServer");
  const allowance = yield* externalCallAllowance(env, identity.orgId);

  return McpAuthorization.make({
    ...identity,
    externalCallAllowance: allowance,
  });
});
