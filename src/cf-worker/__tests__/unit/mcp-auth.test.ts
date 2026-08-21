import { describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { expect } from "vitest";

import {
  WorkspaceAccess,
  WorkspaceAccessBackendError,
} from "../../auth/workspace-access";
import { Billing } from "../../billing/service";
import { DbError } from "../../db/service";
import {
  McpAuthorizationBackendError,
  authorizeMcpClaims,
} from "../../mcp/auth";
import { MCP_WORKSPACE_CLAIM } from "../../mcp/config";

const claims = {
  client_id: "client-1",
  scope: "links:read links:write",
  sub: "user-1",
  [MCP_WORKSPACE_CLAIM]: "org-1",
};

const billingLayer = (capabilities: Billing["Service"]["capabilities"]) =>
  Layer.succeed(Billing, {
    capabilities,
  } as unknown as Billing["Service"]);

const accessLayer = (
  authorizeIdentity: WorkspaceAccess["Service"]["authorizeIdentity"]
) =>
  Layer.succeed(WorkspaceAccess, {
    authorizeIdentity,
  } as unknown as WorkspaceAccess["Service"]);

describe("MCP authorization backend failures", () => {
  it.effect(
    "preserves workspace backend failures as retryable auth errors",
    () =>
      authorizeMcpClaims(claims).pipe(
        Effect.provide(
          Layer.mergeAll(
            accessLayer(() =>
              Effect.fail(
                new WorkspaceAccessBackendError({
                  operation: "lookupMembership",
                  cause: new Error("D1 unavailable"),
                })
              )
            ),
            billingLayer(() => Effect.die("billing must not run"))
          )
        ),
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error).toBeInstanceOf(McpAuthorizationBackendError);
          })
        )
      )
  );

  it.effect("preserves billing database failures for the 503 boundary", () =>
    authorizeMcpClaims(claims).pipe(
      Effect.provide(
        Layer.mergeAll(
          accessLayer((authorization) => Effect.succeed(authorization)),
          billingLayer(() =>
            Effect.fail(new DbError({ cause: new Error("D1 unavailable") }))
          )
        )
      ),
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error).toBeInstanceOf(DbError);
        })
      )
    )
  );
});
