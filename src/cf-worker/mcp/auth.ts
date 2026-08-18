import { Effect, Option, Schema } from "effect";
import type { JWTPayload } from "jose";

import { WorkspaceAccess } from "../auth/workspace-access";
import { workspaceAccessHttpResponse } from "../auth/workspace-access-http";
import { capabilityDeniedResponse } from "../billing/errors";
import { requireCapability } from "../billing/service";
import { OrgId, UserId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import { MCP_WORKSPACE_CLAIM } from "./config";

const McpAccessTokenClaims = Schema.Struct({
  sub: Schema.String,
  aud: Schema.Union([Schema.String, Schema.Array(Schema.String)]),
  client_id: Schema.String,
  iss: Schema.String,
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

const unauthorized = (): Response =>
  Response.json({ error: "Invalid access token claims" }, { status: 401 });

export const tokenTargetsMcp = (
  claims: {
    readonly aud: string | readonly string[];
    readonly iss: string;
  },
  expected: { readonly issuer: string; readonly resource: string }
): boolean =>
  claims.iss === expected.issuer &&
  (Array.isArray(claims.aud)
    ? claims.aud.includes(expected.resource)
    : claims.aud === expected.resource);

export const authorizeMcpClaims = Effect.fnUntraced(function* (
  claims: JWTPayload,
  expected: { readonly issuer: string; readonly resource: string }
) {
  const decoded = yield* decodeClaims(claims).pipe(Effect.option);
  if (Option.isNone(decoded)) return unauthorized();

  const raw = decoded.value;
  if (
    raw.sub.length === 0 ||
    raw.client_id.length === 0 ||
    raw[MCP_WORKSPACE_CLAIM].length === 0 ||
    !tokenTargetsMcp(raw, expected)
  ) {
    return unauthorized();
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
  const currentAccess = yield* workspaceAccess
    .authorizeIdentity(authorization)
    .pipe(
      Effect.matchEffect({
        onFailure: workspaceAccessHttpResponse,
        onSuccess: Effect.succeed,
      })
    );
  if (currentAccess instanceof Response) return currentAccess;

  const denied = yield* requireCapability(
    authorization.orgId,
    "mcpServer"
  ).pipe(
    Effect.as<Response | null>(null),
    Effect.catchTags({
      CapabilityDisabledError: (error) =>
        Effect.succeed(capabilityDeniedResponse(error)),
      OrgNotFoundError: () =>
        Effect.logWarning("MCP authorization: organization not found").pipe(
          Effect.annotateLogs({ orgId: maskId(authorization.orgId) }),
          Effect.as(Response.json({ error: "Forbidden" }, { status: 403 }))
        ),
      DbError: (error) =>
        Effect.logError("MCP authorization: capability check failed").pipe(
          Effect.annotateLogs({
            orgId: maskId(authorization.orgId),
            ...safeErrorInfo(error),
          }),
          Effect.as(
            Response.json(
              { error: "Authorization backend unavailable" },
              { status: 503 }
            )
          )
        ),
    })
  );

  return denied ?? authorization;
});
