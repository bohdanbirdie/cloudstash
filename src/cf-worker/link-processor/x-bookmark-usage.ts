import { Schema } from "effect";

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

export const xBookmarkSettlementKey = (windowId: string, tweetId: string) =>
  `x-bookmark-settlement:${windowId}:${tweetId}`;
