import { mcp } from "@better-auth/mcp";
import { APIError } from "better-auth/api";

import { MCP_SCOPES, MCP_WORKSPACE_CLAIM, mcpResource } from "../mcp/config";
import type { Env } from "../shared";

export const mcpPlugin = (env: Env) =>
  mcp({
    accessTokenExpiresIn: 5 * 60,
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    consentPage: "/oauth-consent",
    customAccessTokenClaims: ({ referenceId }) =>
      referenceId ? { [MCP_WORKSPACE_CLAIM]: referenceId } : {},
    grantTypes: ["authorization_code", "refresh_token"],
    loginPage: "/login",
    postLogin: {
      page: "/oauth-consent",
      shouldRedirect: () => false,
      consentReferenceId: ({ session, scopes }) => {
        if (!scopes.some((scope) => scope.startsWith("links:"))) {
          return undefined;
        }
        const organizationId = session.activeOrganizationId as
          | string
          | undefined;
        if (organizationId) return organizationId;
        throw new APIError("BAD_REQUEST", {
          error: "set_organization",
          error_description:
            "An active workspace is required for Cloudstash link scopes",
        });
      },
    },
    rateLimit: { register: { max: 5, window: 60 } },
    resource: mcpResource(env),
    scopes: [...MCP_SCOPES],
  });
