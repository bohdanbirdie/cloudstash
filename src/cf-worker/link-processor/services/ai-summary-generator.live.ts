import { Effect, Layer } from "effect";

import { safeErrorInfo } from "../../log-utils";
import { generateSummary } from "../generate-summary";
import { AiSummaryGenerator, WorkersAi } from "../services";

export const AiSummaryGeneratorLive = Layer.effect(
  AiSummaryGenerator,
  Effect.gen(function* () {
    const ai = yield* WorkersAi;
    return {
      generate: (params) =>
        generateSummary({ ...params, ai }).pipe(
          Effect.timeout("30 seconds"),
          Effect.catchAll((error) =>
            Effect.logWarning("AI summary generation failed").pipe(
              Effect.annotateLogs(safeErrorInfo(error)),
              Effect.as({ summary: null, suggestedTags: [] })
            )
          ),
          Effect.withSpan("AiSummaryGenerator.generate")
        ),
    };
  })
);
