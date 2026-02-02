import { Effect, Array as A, Option } from "effect";
import type { UIMessage } from "@ai-sdk/react";
import { getToolName, isToolUIPart, type ToolSet } from "ai";

import { requiresConfirmation } from "../../shared/tool-config";

export const APPROVAL = {
  NO: "No, denied.",
  YES: "Yes, confirmed.",
} as const;

type ToolPartWithOutput = {
  toolCallId: string;
  toolName?: string;
  output: string;
  input?: Record<string, unknown>;
};

const isApprovalOutput = (part: unknown): part is ToolPartWithOutput =>
  isToolUIPart(part as never) &&
  "output" in (part as Record<string, unknown>) &&
  ((part as ToolPartWithOutput).output === APPROVAL.YES ||
    (part as ToolPartWithOutput).output === APPROVAL.NO);

export const hasToolConfirmation = (message: UIMessage): boolean =>
  message?.parts?.some(
    (part) =>
      isApprovalOutput(part) && requiresConfirmation(getToolName(part as never))
  ) ?? false;

type ToolExecutors = Record<string, (args: any) => Promise<string>>;

const processToolPart = <T>(
  part: T,
  executors: ToolExecutors
): Effect.Effect<T, never, never> => {
  if (!isApprovalOutput(part)) {
    return Effect.succeed(part);
  }

  const toolName = getToolName(part as never);
  const executor = executors[toolName];

  if (!executor) {
    return Effect.succeed(part);
  }

  return Effect.gen(function* () {
    if (part.output === APPROVAL.YES) {
      const result = yield* Effect.tryPromise(() => executor(part.input ?? {})).pipe(
        Effect.catchAll(() => Effect.succeed("Error: Tool execution failed"))
      );
      return { ...part, output: result } as T;
    }

    if (part.output === APPROVAL.NO) {
      return { ...part, output: "Error: User denied access to tool execution" } as T;
    }

    return part;
  });
};

export const processToolCalls = <Tools extends ToolSet>(
  { messages }: { tools: Tools; messages: UIMessage[] },
  executors: ToolExecutors
): Promise<UIMessage[]> =>
  Effect.gen(function* () {
    const lastMessage = A.last(messages);
    if (Option.isNone(lastMessage) || !lastMessage.value.parts) {
      return messages;
    }

    const msg = lastMessage.value;
    const processedParts = yield* Effect.all(
      msg.parts.map((part) => processToolPart(part, executors)),
      { concurrency: "unbounded" }
    );

    return [
      ...messages.slice(0, -1),
      { ...msg, parts: processedParts.filter(Boolean) },
    ] as UIMessage[];
  }).pipe(Effect.runPromise);
