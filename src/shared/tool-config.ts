export const TOOLS_REQUIRING_CONFIRMATION = ["deleteLink", "deleteLinks"] as const;

export type ToolRequiringConfirmation =
  (typeof TOOLS_REQUIRING_CONFIRMATION)[number];

export const requiresConfirmation = (toolName: string): boolean =>
  (TOOLS_REQUIRING_CONFIRMATION as readonly string[]).includes(toolName);
