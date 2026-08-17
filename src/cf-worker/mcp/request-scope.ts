import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from "./config";

const MAX_MCP_BODY_BYTES = 1024 * 1024;

const requestBody = async (request: Request): Promise<string | Response> => {
  const reader = request.clone().body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let body = "";
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_MCP_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return Response.json(
        { error: "MCP request body too large" },
        { status: 413 }
      );
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
};

export const MCP_TOOL_SCOPES = {
  search_links: MCP_READ_SCOPE,
  save_link: MCP_WRITE_SCOPE,
} as const;

export const scopeForMcpTool = (name: unknown): string | null =>
  typeof name === "string" && Object.hasOwn(MCP_TOOL_SCOPES, name)
    ? MCP_TOOL_SCOPES[name as keyof typeof MCP_TOOL_SCOPES]
    : null;

export const requiredScopesForRequest = async (
  request: Request
): Promise<string[] | Response> => {
  if (request.method !== "POST") return [];

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_MCP_BODY_BYTES) {
    return Response.json(
      { error: "MCP request body too large" },
      { status: 413 }
    );
  }

  const body = await requestBody(request);
  if (body instanceof Response) return body;

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return Response.json(
      { error: "Invalid MCP request body" },
      { status: 400 }
    );
  }

  const messages = Array.isArray(parsed) ? parsed : [parsed];
  const scopes = new Set<string>();
  for (const message of messages) {
    if (typeof message !== "object" || message === null) {
      return Response.json({ error: "Invalid MCP message" }, { status: 400 });
    }
    if (!("method" in message)) continue;
    if (typeof message.method !== "string") {
      return Response.json({ error: "Invalid MCP method" }, { status: 400 });
    }
    if (message.method !== "tools/call") continue;
    if (
      !("params" in message) ||
      typeof message.params !== "object" ||
      message.params === null ||
      !("name" in message.params)
    ) {
      return Response.json({ error: "Invalid MCP tool call" }, { status: 400 });
    }
    const scope = scopeForMcpTool(message.params.name);
    if (!scope) {
      return Response.json(
        { error: "MCP tool is not authorized" },
        { status: 403 }
      );
    }
    scopes.add(scope);
  }
  return [...scopes];
};
