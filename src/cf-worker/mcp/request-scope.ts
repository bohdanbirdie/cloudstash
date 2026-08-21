import { isSpecType, parseJSONRPCMessage } from "@modelcontextprotocol/server";
import type { JSONRPCMessage } from "@modelcontextprotocol/server";
import { Data, Effect, Option } from "effect";

import { MCP_TOOL_NAMES, MCP_TOOL_SCOPES } from "@/lib/mcp";

export const MAX_MCP_BODY_BYTES = 1024 * 1024;

type McpToolName = (typeof MCP_TOOL_NAMES)[number];

const isMcpToolName = (name: unknown): name is McpToolName =>
  typeof name === "string" &&
  MCP_TOOL_NAMES.some((toolName) => toolName === name);

export const scopeForMcpTool = (name: unknown): string | null =>
  isMcpToolName(name) ? MCP_TOOL_SCOPES[name] : null;

export class McpRequestRejected extends Data.TaggedError("McpRequestRejected")<{
  readonly message: string;
  readonly status: 400 | 403;
}> {}

export class McpInsufficientScopeError extends Data.TaggedError(
  "McpInsufficientScopeError"
)<{ readonly scopes: readonly string[] }> {}

export const mcpBodyTooLargeResponse = (): Response =>
  Response.json(
    {
      error: { code: -32e3, message: "MCP request body too large" },
      id: null,
      jsonrpc: "2.0",
    },
    { status: 413 }
  );

const invalidRequest = (message: string) =>
  new McpRequestRejected({ message, status: 400 });

const parseMessages = (parsedBody: unknown): readonly JSONRPCMessage[] => {
  const messages = Array.isArray(parsedBody) ? parsedBody : [parsedBody];
  if (messages.length === 0) throw invalidRequest("Invalid MCP request body");
  return messages.map(parseJSONRPCMessage);
};

export const requiredScopesForRequest = Effect.fnUntraced(function* (
  request: Request
) {
  if (request.method !== "POST") {
    return { parsedBody: undefined, scopes: [] };
  }

  const body = yield* Effect.tryPromise(() => request.clone().text()).pipe(
    Effect.option
  );
  if (Option.isNone(body)) {
    return yield* new McpRequestRejected({
      message: "Invalid MCP request body",
      status: 400,
    });
  }

  const { messages, parsedBody } = yield* Effect.try({
    try: () => {
      const parsed: unknown = JSON.parse(body.value);
      return { messages: parseMessages(parsed), parsedBody: parsed };
    },
    catch: () => invalidRequest("Invalid MCP request body"),
  });
  const scopes = new Set<string>();
  for (const message of messages) {
    if (!("method" in message) || message.method !== "tools/call") {
      continue;
    }
    if (!isSpecType.CallToolRequest(message)) {
      return yield* invalidRequest("Invalid MCP tool call");
    }
    const scope = scopeForMcpTool(message.params.name);
    if (!scope) {
      return yield* new McpRequestRejected({
        message: "MCP tool is not authorized",
        status: 403,
      });
    }
    scopes.add(scope);
  }
  return { parsedBody, scopes: [...scopes] };
});
