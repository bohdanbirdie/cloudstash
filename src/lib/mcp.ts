export const MCP_READ_SCOPE = "links:read";
export const MCP_WRITE_SCOPE = "links:write";
export const MCP_SCOPES = [
  "openid",
  "offline_access",
  MCP_READ_SCOPE,
  MCP_WRITE_SCOPE,
] as const;

export const MCP_TOOL_SCOPES = {
  search_links: MCP_READ_SCOPE,
  save_link: MCP_WRITE_SCOPE,
} as const;
