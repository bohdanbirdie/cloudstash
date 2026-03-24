import { Effect, Layer } from "effect";

import { AiCallError } from "../errors";
import { generateSummary } from "../generate-summary";
import { AiSummaryGenerator, WorkersAi } from "../services";
import { LinkProcessorAiLive } from "./ai-client.live";

export const AiSummaryGeneratorLive = Layer.effect(
  AiSummaryGenerator,
  Effect.gen(function* () {
    const aiClientLayer = LinkProcessorAiLive.pipe(
      Layer.provide(Layer.succeed(WorkersAi, yield* WorkersAi))
    );

    return {
      generate: (params) =>
        generateSummary(params).pipe(
          Effect.provide(aiClientLayer),
          Effect.timeout("30 seconds"),
          Effect.catchTag("TimeoutException", (e) =>
            Effect.fail(new AiCallError({ cause: e }))
          ),
          Effect.withSpan("AiSummaryGenerator.generate")
        ),
    };
  })
);
