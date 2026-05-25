import type { TierCapabilities } from "@/lib/plan";

export type BooleanCapKey = Extract<
  keyof TierCapabilities,
  | "aiSummary"
  | "chatAgent"
  | "integrations"
  | "xBookmarkSync"
  | "xContentEnrichment"
  | "publicApi"
  | "mcpServer"
>;

export const BOOLEAN_CAPS: ReadonlyArray<{
  key: BooleanCapKey;
  short: string;
  label: string;
}> = [
  { key: "aiSummary", short: "AI", label: "AI summaries" },
  { key: "chatAgent", short: "Chat", label: "Chat agent" },
  { key: "integrations", short: "Int", label: "Integrations" },
  { key: "xBookmarkSync", short: "X", label: "X bookmarks" },
  { key: "xContentEnrichment", short: "X+", label: "X content enrichment" },
  { key: "publicApi", short: "API", label: "Public API" },
  { key: "mcpServer", short: "MCP", label: "MCP server" },
];

export const IS_DEV = import.meta.env.DEV;

export function effectiveBoolean(
  override: boolean | undefined,
  tierDefault: boolean
): boolean {
  return override ?? tierDefault;
}

export function shortenId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 10)}…${id.slice(-3)}` : id;
}

export function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "•••";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local[0] ?? ""}•••@${domain}`;
}

export function redactName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "•••";
  return words.map((w) => `${w[0] ?? ""}•••`).join(" ");
}

export function cleanWorkspaceName(name: string): string {
  return name.replace(/(?:'s)?\s*workspace\s*$/i, "").trim();
}
