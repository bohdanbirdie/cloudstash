import type { Env } from "../shared";

export const MCP_READ_SCOPE = "links:read";
export const MCP_WRITE_SCOPE = "links:write";
export const MCP_SCOPES = [
  "openid",
  "offline_access",
  MCP_READ_SCOPE,
  MCP_WRITE_SCOPE,
] as const;

export const MCP_WORKSPACE_CLAIM = "https://cloudstash.dev/claims/workspace-id";

export const mcpResource = (env: Env): string =>
  new URL("/mcp", env.BETTER_AUTH_URL).toString();
