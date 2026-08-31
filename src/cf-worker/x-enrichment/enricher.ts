import { Effect } from "effect";

import type { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { EnrichmentBudgetExhaustedError } from "./errors";
import { EnrichmentGenerator } from "./generator";
import { ThreadProvider } from "./services";
import { EnrichmentUsage } from "./usage";

export interface EnrichSummaryParams {
  readonly storeId: OrgId;
  readonly url: string;
  readonly existingTags: ReadonlyArray<{ readonly name: string }>;
  readonly monthlyLimit: number;
  readonly settlementId: string;
  readonly usageWindowId: string;
}

export const enrichSummary = Effect.fn("X.enrichSummary")(function* (
  params: EnrichSummaryParams
) {
  const { storeId, url, existingTags } = params;
  yield* Effect.annotateCurrentSpan({
    storeId: maskId(storeId),
    existingTagCount: existingTags.length,
  });

  const usage = yield* EnrichmentUsage;
  const reservation = yield* usage.reserve(storeId, {
    cap: params.monthlyLimit,
    settlementId: params.settlementId,
    windowId: params.usageWindowId,
  });
  if (!reservation.reserved) {
    return yield* new EnrichmentBudgetExhaustedError({
      storeId,
      period: reservation.period,
      used: reservation.used,
      cap: params.monthlyLimit,
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

  yield* Effect.annotateCurrentSpan({
    enrichmentsUsedAfter: reservation.used,
    period: reservation.period,
    summaryLength: output.summary.length,
    suggestedTagsCount: output.suggestedTags.length,
  });

  return output;
});
