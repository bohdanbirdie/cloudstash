export const MCP_READ_SCOPE = "links:read";
export const MCP_WRITE_SCOPE = "links:write";
export const MCP_SCOPES = [
  "openid",
  "offline_access",
  MCP_READ_SCOPE,
  MCP_WRITE_SCOPE,
] as const;

export const MCP_TOOL_NAMES = [
  "list_links",
  "search_links",
  "get_link",
  "save_link",
  "update_link",
  "update_links",
] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export const MCP_TOOL_SCOPES = {
  list_links: MCP_READ_SCOPE,
  search_links: MCP_READ_SCOPE,
  get_link: MCP_READ_SCOPE,
  save_link: MCP_WRITE_SCOPE,
  update_link: MCP_WRITE_SCOPE,
  update_links: MCP_WRITE_SCOPE,
} as const satisfies Record<
  McpToolName,
  typeof MCP_READ_SCOPE | typeof MCP_WRITE_SCOPE
>;
