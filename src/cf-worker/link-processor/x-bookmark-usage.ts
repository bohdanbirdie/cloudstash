import { Schema } from "effect";

import type { XTweetId } from "../db/branded";

export class XBookmarkAdmissionError extends Schema.TaggedError<XBookmarkAdmissionError>()(
  "XBookmarkAdmissionError",
  {
    op: Schema.String,
    cause: Schema.Defect(),
  }
) {}

export const XBookmarkEnqueueOutcome = Schema.Literals([
  "enqueued",
  "duplicate",
  "limit_reached",
]);
export type XBookmarkEnqueueOutcome = typeof XBookmarkEnqueueOutcome.Type;

export const XBookmarkUsageData = Schema.Struct({
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type XBookmarkUsageData = typeof XBookmarkUsageData.Type;

export const xBookmarkUsageKey = (windowId: string) =>
  `x-bookmark-usage:${windowId}`;

export const xBookmarkSettlementKey = (windowId: string, tweetId: XTweetId) =>
  `x-bookmark-settlement:${windowId}:${tweetId}`;
