import { Data, Effect, Option, Schema } from "effect";

import { MCP_TOOL_NAMES, MCP_TOOL_SCOPES } from "@/lib/mcp";

export const MAX_MCP_BODY_BYTES = 1024 * 1024;

const McpMessage = Schema.Struct({
  method: Schema.optional(Schema.String),
  params: Schema.optional(Schema.Unknown),
});
const McpMessagesFromJson = Schema.fromJsonString(
  Schema.Union([McpMessage, Schema.Array(McpMessage)])
);
const McpToolCall = Schema.Struct({
  method: Schema.Literal("tools/call"),
  params: Schema.Struct({ name: Schema.String }),
});
const McpToolName = Schema.Literals(MCP_TOOL_NAMES);

const decodeMessages = Schema.decodeUnknownOption(McpMessagesFromJson);
const decodeToolCall = Schema.decodeUnknownOption(McpToolCall);
const decodeToolName = Schema.decodeUnknownOption(McpToolName);

export const scopeForMcpTool = (name: unknown): string | null => {
  const decoded = decodeToolName(name);
  return Option.isSome(decoded) ? MCP_TOOL_SCOPES[decoded.value] : null;
};

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

export const requiredScopesForRequest = Effect.fnUntraced(function* (
  request: Request
) {
  if (request.method !== "POST") return [];

  const body = yield* Effect.tryPromise(() => request.clone().text()).pipe(
    Effect.option
  );
  if (Option.isNone(body)) {
    return yield* new McpRequestRejected({
      message: "Invalid MCP request body",
      status: 400,
    });
  }

  const decoded = decodeMessages(body.value);
  if (Option.isNone(decoded)) {
    return yield* new McpRequestRejected({
      message: "Invalid MCP request body",
      status: 400,
    });
  }

  const messages = Array.isArray(decoded.value)
    ? decoded.value
    : [decoded.value];
  const scopes = new Set<string>();
  for (const message of messages) {
    if (message.method === undefined || message.method !== "tools/call") {
      continue;
    }
    const toolCall = decodeToolCall(message);
    if (Option.isNone(toolCall)) {
      return yield* new McpRequestRejected({
        message: "Invalid MCP tool call",
        status: 400,
      });
    }
    const scope = scopeForMcpTool(toolCall.value.params.name);
    if (!scope) {
      return yield* new McpRequestRejected({
        message: "MCP tool is not authorized",
        status: 403,
      });
    }
    scopes.add(scope);
  }
  return [...scopes];
});
