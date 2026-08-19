import type { Env } from "../shared";

export { MCP_READ_SCOPE, MCP_SCOPES, MCP_WRITE_SCOPE } from "@/lib/mcp";

export const MCP_WORKSPACE_CLAIM = "https://cloudstash.dev/claims/workspace-id";

export const mcpResource = (env: Env): string =>
  new URL("/mcp", env.BETTER_AUTH_URL).toString();
