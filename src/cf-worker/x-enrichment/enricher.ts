import { Effect } from "effect";

import type { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { EnrichmentBudgetExhaustedError } from "./errors";
import { EnrichmentGenerator } from "./generator";
import { ThreadProvider } from "./services";
import { MONTHLY_ENRICHMENT_CAP } from "./types";
import { EnrichmentUsage } from "./usage";

export interface EnrichSummaryParams {
  readonly storeId: OrgId;
  readonly url: string;
  readonly existingTags: ReadonlyArray<{ readonly name: string }>;
}

export const enrichSummary = Effect.fn("X.enrichSummary")(function* (
  params: EnrichSummaryParams
) {
  const { storeId, url, existingTags } = params;
  yield* Effect.annotateCurrentSpan({
    storeId: maskId(storeId),
    url,
    existingTagCount: existingTags.length,
  });

  const usage = yield* EnrichmentUsage;
  const current = yield* usage.current(storeId);
  if (current.used >= MONTHLY_ENRICHMENT_CAP) {
    return yield* new EnrichmentBudgetExhaustedError({
      storeId,
      period: current.period,
      used: current.used,
      cap: MONTHLY_ENRICHMENT_CAP,
    });
  }

  const provider = yield* ThreadProvider;
  const context = yield* provider.fetchContext({ url });

  yield* Effect.annotateCurrentSpan({
    threadContinuations: context.authorContinuations.length,
    isReply: context.isReply,
    externalUrlCount: context.root.externalUrls.length,
  });

  const generator = yield* EnrichmentGenerator;
  const output = yield* generator.generate({ url, context, existingTags });

  const reserved = yield* usage.increment(storeId);
  yield* Effect.annotateCurrentSpan({
    enrichmentsUsedAfter: reserved.used,
    period: reserved.period,
    summaryLength: output.summary.length,
    suggestedTagsCount: output.suggestedTags.length,
  });

  return output;
});
