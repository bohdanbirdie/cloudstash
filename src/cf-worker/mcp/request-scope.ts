import { Effect, Option, Schema } from "effect";

import { readRequestBody } from "../http/request-body";
import { MCP_READ_SCOPE, MCP_WRITE_SCOPE } from "./config";

const MAX_MCP_BODY_BYTES = 1024 * 1024;

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
const McpToolName = Schema.Literals(["search_links", "save_link"]);

const decodeMessages = Schema.decodeUnknownOption(McpMessagesFromJson);
const decodeToolCall = Schema.decodeUnknownOption(McpToolCall);
const decodeToolName = Schema.decodeUnknownOption(McpToolName);

export const MCP_TOOL_SCOPES = {
  search_links: MCP_READ_SCOPE,
  save_link: MCP_WRITE_SCOPE,
} as const;

export const scopeForMcpTool = (name: unknown): string | null => {
  const decoded = decodeToolName(name);
  return Option.isSome(decoded) ? MCP_TOOL_SCOPES[decoded.value] : null;
};

const bodyErrorResponse = (status: 400 | 403 | 413, error: string): Response =>
  Response.json({ error }, { status });

export const requiredScopesForRequest = Effect.fn(
  "MCP.requiredScopesForRequest"
)(function* (request: Request) {
  if (request.method !== "POST") return [];

  const body = yield* readRequestBody(request, MAX_MCP_BODY_BYTES).pipe(
    Effect.match({
      onFailure: (error) =>
        error._tag === "RequestBodyTooLargeError"
          ? bodyErrorResponse(413, "MCP request body too large")
          : bodyErrorResponse(400, "Invalid MCP request body"),
      onSuccess: (value) => value,
    })
  );
  if (body instanceof Response) return body;

  const decoded = decodeMessages(body);
  if (Option.isNone(decoded)) {
    return bodyErrorResponse(400, "Invalid MCP request body");
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
      return bodyErrorResponse(400, "Invalid MCP tool call");
    }
    const scope = scopeForMcpTool(toolCall.value.params.name);
    if (!scope) {
      return bodyErrorResponse(403, "MCP tool is not authorized");
    }
    scopes.add(scope);
  }
  return [...scopes];
});
