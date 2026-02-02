export type SlashCommand = {
  name: string;
  description: string;
  args?: string;
  handler: "client" | "server";
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "help", description: "Show available commands", handler: "client" },
  { name: "clear", description: "Clear chat history", handler: "client" },
  {
    name: "search",
    description: "Search your links",
    args: "<query>",
    handler: "server",
  },
  {
    name: "save",
    description: "Save a new link",
    args: "<url>",
    handler: "server",
  },
  {
    name: "recent",
    description: "Show recent links",
    args: "[count]",
    handler: "server",
  },
];

export function parseSlashCommand(
  text: string
): { command: SlashCommand; args: string } | null {
  const match = text.match(/^\/(\w+)(?:\s+(.*))?$/);
  if (!match) return null;

  const [, name, args = ""] = match;
  const command = SLASH_COMMANDS.find((c) => c.name === name);

  return command ? { command, args: args.trim() } : null;
}
