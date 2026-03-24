import { generateText, NoObjectGeneratedError, Output } from "ai";
import { Effect, Layer } from "effect";
import { createWorkersAI } from "workers-ai-provider";

import { AiCallError } from "../errors";
import { LinkProcessorAi, WorkersAi } from "../services";
import { AI_MODEL } from "../types";

export const LinkProcessorAiLive = Layer.effect(
  LinkProcessorAi,
  Effect.gen(function* () {
    const ai = yield* WorkersAi;
    const workersAI = createWorkersAI({ binding: ai });

    return {
      generateObject: ({ system, prompt, schema, maxOutputTokens }) =>
        Effect.tryPromise({
          catch: (cause) => {
            if (NoObjectGeneratedError.isInstance(cause)) {
              return { _tag: "NoObject" as const, text: cause.text };
            }
            return new AiCallError({ cause });
          },
          try: async () => {
            const { output } = await generateText({
              maxOutputTokens,
              model: workersAI(AI_MODEL),
              output: Output.object({ schema }),
              system,
              prompt,
            });
            return output;
          },
        }).pipe(
          Effect.catchIf(
            (e): e is { _tag: "NoObject"; text: string | undefined } =>
              !(e instanceof AiCallError),
            (e) =>
              Effect.logWarning("AI returned no valid object").pipe(
                Effect.annotateLogs({ rawText: e.text ?? "(empty)" }),
                Effect.as(null)
              )
          )
        ),
    };
  })
);
