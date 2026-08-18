import { API_FALLBACK_ORIGIN } from "./api-spec";

export const MCP_CONNECTION_GUIDANCE = {
  authentication: "OAuth",
  path: "/mcp",
  protocol: "Latest (2026-07-28)",
  registration: "Dynamic Client Registration (DCR)",
  scopeOverride: "openid offline_access links:read links:write",
  transport: "HTTP",
} as const;

export const MCP_LOCAL_ORIGIN_GUIDANCE =
  "For local use, open Cloudstash and configure BETTER_AUTH_URL with this same origin.";

export const mcpEndpointForOrigin = (origin: string): string =>
  new URL(MCP_CONNECTION_GUIDANCE.path, origin).toString();

export const mcpEndpoint = (): string =>
  mcpEndpointForOrigin(
    typeof window === "undefined" ? API_FALLBACK_ORIGIN : window.location.origin
  );
