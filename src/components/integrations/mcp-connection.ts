import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from "@/lib/mcp";

import { API_FALLBACK_ORIGIN } from "./api-spec";

export const MCP_CONNECTION_GUIDANCE = {
  authentication: "OAuth",
  path: "/mcp",
  protocol: "2026-07-28 (recommended); 2025-11-25 fallback",
  registration: "Dynamic Client Registration (DCR)",
  scopeOverride: "Leave blank — scopes are requested automatically",
  scopes: `${MCP_READ_SCOPE} ${MCP_WRITE_SCOPE}`,
  transport: "Streamable HTTP",
} as const;

export const MCP_LOCAL_ORIGIN_GUIDANCE =
  "For local use, open Cloudstash and configure BETTER_AUTH_URL with this same origin.";

export const mcpClientSetups = (endpoint: string) =>
  [
    {
      id: "claude",
      instruction: "Run once, then approve the workspace in your browser.",
      label: "Claude Code",
      value: `claude mcp add --transport http --scope user cloudstash ${endpoint}`,
    },
    {
      id: "codex",
      instruction: "Run once. Codex opens OAuth when it first connects.",
      label: "Codex",
      value: `codex mcp add cloudstash --url ${endpoint}`,
    },
    {
      id: "opencode",
      instruction: "Run once, then approve access in your browser.",
      label: "OpenCode",
      value: `opencode mcp add cloudstash --url ${endpoint} && opencode mcp auth cloudstash`,
    },
  ] as const;

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
