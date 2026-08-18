import { API_FALLBACK_ORIGIN } from "./api-spec";

export const MCP_CONNECTION_GUIDANCE = {
  authentication: "OAuth",
  path: "/mcp",
  protocol: "2026-07-28 (recommended); 2025-11-25 fallback",
  registration: "Dynamic Client Registration (DCR)",
  scopeOverride: "Leave blank — scopes are requested automatically",
  scopes: "links:read links:write",
  transport: "Streamable HTTP",
} as const;

export const MCP_SETUP_STEPS = [
  {
    title: "Add the server.",
    description: "Choose HTTP and paste the URL above.",
  },
  {
    title: "Choose OAuth.",
    description: "Leave the scope override empty; registration is automatic.",
  },
  {
    title: "Approve the workspace.",
    description: "Sign in to Cloudstash and review the access request.",
  },
] as const;

export const MCP_LOCAL_ORIGIN_GUIDANCE =
  "For local use, open Cloudstash and configure BETTER_AUTH_URL with this same origin.";

export type McpAvailabilityState =
  | "loading"
  | "unavailable"
  | "disabled"
  | "upgrade"
  | "available";

export const mcpAvailabilityState = (input: {
  readonly allowed: boolean;
  readonly alreadyPro: boolean;
  readonly failed: boolean;
  readonly loading: boolean;
}): McpAvailabilityState => {
  if (input.loading) return "loading";
  if (input.failed) return "unavailable";
  if (!input.allowed && input.alreadyPro) return "disabled";
  return input.allowed ? "available" : "upgrade";
};

export const mcpEndpointForOrigin = (origin: string): string =>
  new URL(MCP_CONNECTION_GUIDANCE.path, origin).toString();

export const mcpEndpoint = (): string =>
  mcpEndpointForOrigin(
    typeof window === "undefined" ? API_FALLBACK_ORIGIN : window.location.origin
  );
