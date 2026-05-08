import { generateText, tool } from "ai";
import { Effect, Layer } from "effect";
import { createWorkersAI } from "workers-ai-provider";

import { AiCallError } from "../errors";
import { LinkProcessorAi, WorkersAi } from "../services";
import { AI_MODEL } from "../types";

const TOOL_NAME = "recordOutput";
const RAW_LOG_LIMIT = 500;

export const LinkProcessorAiLive = Layer.effect(
  LinkProcessorAi,
  Effect.gen(function* () {
    const ai = yield* WorkersAi;
    const workersAI = createWorkersAI({ binding: ai });

    return {
      generateObject: ({ system, prompt, schema, maxOutputTokens }) =>
        Effect.gen(function* () {
          const result = yield* Effect.tryPromise({
            catch: (cause) => new AiCallError({ cause }),
            try: () =>
              generateText({
                maxOutputTokens,
                model: workersAI(AI_MODEL),
                prompt,
                system,
                toolChoice: { type: "tool", toolName: TOOL_NAME },
                tools: {
                  [TOOL_NAME]: tool({
                    description: "Record the structured output.",
                    inputSchema: schema,
                  }),
                },
              }),
          });

          const call = result.toolCalls.find((c) => c.toolName === TOOL_NAME);
          if (!call) {
            yield* Effect.logWarning(
              "AI did not invoke the structured-output tool"
            ).pipe(
              Effect.annotateLogs({
                rawText: result.text?.slice(0, RAW_LOG_LIMIT) ?? "(empty)",
              })
            );
            return null;
          }
          return schema.parse(call.input);
        }),
    };
  })
);
