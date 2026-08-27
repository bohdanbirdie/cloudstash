import type { UIMessage } from "@ai-sdk/react";
import { getToolName, isToolUIPart } from "ai";
import type { DynamicToolUIPart, ToolSet, ToolUIPart } from "ai";
import { Effect, Array as A, Option } from "effect";

import { requiresConfirmation } from "@/shared/tool-config";

import { OtelTracingLive } from "../tracing";

export const APPROVAL = {
  NO: "No, denied.",
  YES: "Yes, confirmed.",
} as const;

type MessagePart = UIMessage["parts"][number];
type ToolPart = ToolUIPart | DynamicToolUIPart;
type ApprovalOutput = (typeof APPROVAL)[keyof typeof APPROVAL];
type ApprovalToolPart = ToolPart & {
  readonly state: "output-available";
  readonly output: ApprovalOutput;
};

const isApprovalOutput = (part: MessagePart): part is ApprovalToolPart =>
  isToolUIPart(part) &&
  part.state === "output-available" &&
  (part.output === APPROVAL.YES || part.output === APPROVAL.NO);

export const hasToolConfirmation = (message: UIMessage | undefined): boolean =>
  message?.parts?.some(
    (part) => isApprovalOutput(part) && requiresConfirmation(getToolName(part))
  ) ?? false;

type ToolExecutors = Record<string, (args: any) => Promise<string>>;

const processToolPart = (
  part: MessagePart,
  executors: ToolExecutors
): Effect.Effect<MessagePart> => {
  if (!isApprovalOutput(part)) {
    return Effect.succeed(part);
  }

  const toolName = getToolName(part);
  const executor = executors[toolName];

  if (!executor) {
    return Effect.succeed(part);
  }

  return Effect.gen(function* () {
    if (part.output === APPROVAL.YES) {
      const result = yield* Effect.tryPromise(() =>
        executor(part.input ?? {})
      ).pipe(
        Effect.tapError((e) =>
          Effect.logError("Tool execution failed").pipe(
            Effect.annotateLogs({ toolName, error: String(e) })
          )
        ),
        Effect.catch(() => Effect.succeed("Error: Tool execution failed"))
      );
      return { ...part, output: result };
    }

    if (part.output === APPROVAL.NO) {
      return {
        ...part,
        output: "Error: User denied access to tool execution",
      };
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
    ];
  }).pipe(
    Effect.withSpan("ChatAgent.processToolCalls"),
    Effect.provide(OtelTracingLive),
    Effect.runPromise
  );
