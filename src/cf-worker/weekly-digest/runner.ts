import { nanoid } from "@livestore/livestore";
import { Duration, Effect } from "effect";

import { DigestId } from "../db/branded";
import { WeeklyDigestGenerator } from "./generator";
import { isoWeek } from "./iso-week";
import { DigestEventSink, DigestLinkSource } from "./services";

const DIGEST_LOOKBACK_MS = Duration.toMillis("7 days");

export type WeeklyDigestTrigger = "alarm" | "manual";

export type WeeklyDigestResult =
  | {
      readonly status: "generated";
      readonly period: string;
      readonly linkCount: number;
    }
  | { readonly status: "skipped-empty"; readonly period: string };

const generated = (period: string, linkCount: number): WeeklyDigestResult => ({
  linkCount,
  period,
  status: "generated",
});

const skippedEmpty = (period: string): WeeklyDigestResult => ({
  period,
  status: "skipped-empty",
});

export interface RunDigestParams {
  readonly trigger: WeeklyDigestTrigger;
  readonly now: Date;
}

export const runDigest = Effect.fn("WeeklyDigest.run")(function* (
  params: RunDigestParams
) {
  const { now, trigger } = params;
  const period = isoWeek(now);
  const cutoff = now.getTime() - DIGEST_LOOKBACK_MS;

  yield* Effect.annotateCurrentSpan("trigger", trigger);
  yield* Effect.annotateCurrentSpan("period", period);

  const linkSource = yield* DigestLinkSource;
  const links = yield* linkSource.collect(cutoff);
  yield* Effect.annotateCurrentSpan("linkCount", links.length);

  if (links.length === 0) {
    yield* Effect.logInfo(
      "Weekly digest skipped: no links in lookback window"
    ).pipe(Effect.annotateLogs({ period, trigger }));
    return skippedEmpty(period);
  }

  const generator = yield* WeeklyDigestGenerator;
  const contentMd = yield* generator.generate({ generatedAt: now, links });

  const eventSink = yield* DigestEventSink;
  yield* eventSink.commit({
    contentMd,
    generatedAt: now,
    id: DigestId.make(nanoid()),
    period,
  });

  yield* Effect.logInfo("Weekly digest generated").pipe(
    Effect.annotateLogs({ linkCount: links.length, period, trigger })
  );

  return generated(period, links.length);
});
