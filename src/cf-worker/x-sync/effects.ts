import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { AuthClient } from "../auth/service";
import { OrgId, UserId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import { sideEffectError } from "./effects-helpers";
import { NoAccessTokenError } from "./errors";
import type { XBookmarkTweet } from "./services";
import { XApiClient } from "./services";
import { LinkQueueClient } from "./services/link-queue-client";
import { XSyncStateStore } from "./services/x-sync-state-store";

export { sideEffectError } from "./effects-helpers";

export const POLL_INTERVAL_MS = 30_000;
export const BACKOFF_BASE_MS = 60_000;
export const BACKOFF_CAP_MS = 15 * 60_000;
// Pagination walk size — capped at 50 (not 100) because of a long-standing X
// API bug where next_token disappears after 2-3 pages at max_results=100.
const PAGINATION_PAGE_SIZE = 50;

export type PollOutcome =
  | { kind: "ok"; newCount: number; rescheduleInMs: number }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "needs_reconnect" }
  | { kind: "not_initialized" };

export const getAccessTokenEffect = Effect.fn("XBookmarkSyncDO.getAccessToken")(
  function* (userId: UserId) {
    yield* Effect.annotateCurrentSpan("userId", userId);
    const auth = yield* AuthClient;
    const result = yield* Effect.tryPromise({
      try: () => auth.api.getAccessToken({ body: { providerId: "x", userId } }),
      catch: sideEffectError("auth.getAccessToken"),
    }).pipe(
      Effect.catchTag("XSyncSideEffectError", (e) =>
        Effect.logWarning("getAccessToken failed").pipe(
          Effect.annotateLogs({ userId, op: e.op, cause: String(e.cause) }),
          Effect.as(null)
        )
      )
    );
    return result?.accessToken ?? null;
  }
);

const getOrgIdEffect = Effect.fn("XBookmarkSyncDO.getOrgId")(function* (
  userId: UserId
) {
  yield* Effect.annotateCurrentSpan("userId", userId);
  const db = yield* DbClient;
  const member = yield* query(
    db.query.member.findFirst({
      where: eq(schema.member.userId, userId),
    })
  );
  return member ? OrgId.make(member.organizationId) : null;
});

const enqueueBookmarksEffect = Effect.fn("XBookmarkSyncDO.enqueueBookmarks")(
  function* (userId: UserId, bookmarks: ReadonlyArray<XBookmarkTweet>) {
    const orgId = yield* getOrgIdEffect(userId);
    if (!orgId) {
      yield* Effect.logWarning("enqueueBookmarks: no org for user").pipe(
        Effect.annotateLogs({ userId })
      );
      return;
    }
    const queue = yield* LinkQueueClient;
    yield* Effect.forEach(
      bookmarks,
      (b) =>
        queue
          .send({
            url: `https://x.com/i/status/${b.id}`,
            storeId: orgId,
            source: "x_bookmark",
            sourceMeta: JSON.stringify({
              tweetId: b.id,
              authorId: b.author_id,
              text: b.text,
              createdAt: b.created_at,
            }),
          })
          .pipe(
            Effect.catchTag("XSyncSideEffectError", (e) =>
              Effect.logWarning("enqueueBookmarks: queue send failed").pipe(
                Effect.annotateLogs({
                  userId,
                  tweetId: b.id,
                  cause: String(e.cause),
                })
              )
            )
          ),
      { concurrency: 5, discard: true }
    );
    yield* Effect.annotateCurrentSpan("count", bookmarks.length);
    yield* Effect.annotateCurrentSpan("orgId", orgId);
    yield* Effect.logInfo("enqueueBookmarks").pipe(
      Effect.annotateLogs({ userId, orgId, count: bookmarks.length })
    );
  }
);

/**
 * Probe the newest bookmark and pin the watermark to it WITHOUT enqueuing.
 * Critical cost-safety: a fresh connect with 800 existing bookmarks must not
 * trigger 800 link-processing jobs (~$3.50 in fees per user, mostly AI summary).
 * We sync from connect-time onward; existing bookmarks stay on X.
 *
 * Logs and silently returns on any X API error — the next regular poll has its
 * own safety net (the watermark-null heuristic in pollOnceEffect).
 */
export const initializeWatermarkEffect = Effect.fn(
  "XBookmarkSyncDO.initializeWatermark"
)(function* (userId: UserId) {
  yield* Effect.annotateCurrentSpan("userId", userId);
  const store = yield* XSyncStateStore;
  const state = yield* store
    .get()
    .pipe(
      Effect.catchTag("XSyncStorageError", (e) =>
        Effect.logWarning("initializeWatermark: storage get failed").pipe(
          Effect.annotateLogs({ userId, op: e.op, cause: String(e.cause) }),
          Effect.as(null)
        )
      )
    );
  if (!state) return;

  const accessToken = yield* getAccessTokenEffect(userId);
  if (!accessToken) return;

  const api = yield* XApiClient;

  yield* api
    .getBookmarks({
      xUserId: state.xUserId,
      accessToken,
      maxResults: 1,
    })
    .pipe(
      Effect.flatMap((page) => {
        const newestId = page.data[0]?.id;
        if (!newestId) {
          return Effect.logInfo(
            "initializeWatermark: no existing bookmarks"
          ).pipe(Effect.annotateLogs({ userId, xUserId: state.xUserId }));
        }
        return store.setWatermark(newestId).pipe(
          Effect.tap(() => Effect.annotateCurrentSpan("watermark", newestId)),
          Effect.tap(() =>
            Effect.logInfo("initializeWatermark: pinned").pipe(
              Effect.annotateLogs({
                userId,
                xUserId: state.xUserId,
                watermark: newestId,
              })
            )
          ),
          Effect.catchTag("XSyncStorageError", (e) =>
            Effect.logWarning("initializeWatermark: storage write failed").pipe(
              Effect.annotateLogs({ userId, op: e.op, cause: String(e.cause) })
            )
          )
        );
      }),
      Effect.catchTags({
        XUnauthorizedError: (e) =>
          Effect.logWarning("initializeWatermark: 401").pipe(
            Effect.annotateLogs({
              userId,
              xUserId: state.xUserId,
              endpoint: e.endpoint,
            })
          ),
        XPaymentRequiredError: (e) =>
          Effect.logWarning("initializeWatermark: 402").pipe(
            Effect.annotateLogs({
              userId,
              xUserId: state.xUserId,
              endpoint: e.endpoint,
            })
          ),
        XRateLimitedError: (e) =>
          Effect.logWarning("initializeWatermark: 429").pipe(
            Effect.annotateLogs({
              userId,
              xUserId: state.xUserId,
              endpoint: e.endpoint,
              retryAfterMs: e.retryAfterMs,
            })
          ),
        XApiError: (e) =>
          Effect.logWarning("initializeWatermark: api error").pipe(
            Effect.annotateLogs({
              userId,
              xUserId: state.xUserId,
              endpoint: e.endpoint,
              status: e.status,
              message: e.message,
            })
          ),
      })
    );
});

export const pollOnceEffect = Effect.fn("XBookmarkSyncDO.pollOnce")(function* (
  userId: UserId
) {
  yield* Effect.annotateCurrentSpan("userId", userId);
  const store = yield* XSyncStateStore;
  const state = yield* store
    .get()
    .pipe(
      Effect.catchTag("XSyncStorageError", (e) =>
        Effect.logWarning("pollOnce: storage get failed").pipe(
          Effect.annotateLogs({ userId, op: e.op, cause: String(e.cause) }),
          Effect.as(null)
        )
      )
    );
  if (!state) {
    return { kind: "not_initialized" } satisfies PollOutcome;
  }

  yield* Effect.annotateCurrentSpan("xUserId", state.xUserId);
  yield* Effect.annotateCurrentSpan(
    "watermarkTweetId",
    state.watermarkTweetId ?? "none"
  );

  const accessToken = yield* getAccessTokenEffect(userId);
  if (!accessToken) {
    yield* store
      .setStatus("needs_reconnect")
      .pipe(
        Effect.catchTag("XSyncStorageError", (e) =>
          Effect.logWarning("pollOnce: setStatus failed").pipe(
            Effect.annotateLogs({ userId, op: e.op, cause: String(e.cause) })
          )
        )
      );
    return yield* new NoAccessTokenError({ userId });
  }

  const api = yield* XApiClient;

  return yield* api
    .getBookmarks({
      xUserId: state.xUserId,
      accessToken,
      maxResults: 1,
    })
    .pipe(
      Effect.flatMap((probe) =>
        Effect.gen(function* () {
          const newestId = probe.data[0]?.id;

          if (!newestId) {
            yield* Effect.annotateCurrentSpan("newCount", 0);
            return {
              kind: "ok",
              newCount: 0,
              rescheduleInMs: POLL_INTERVAL_MS,
            } satisfies PollOutcome;
          }

          if (newestId === state.watermarkTweetId) {
            yield* Effect.annotateCurrentSpan("newCount", 0);
            return {
              kind: "ok",
              newCount: 0,
              rescheduleInMs: POLL_INTERVAL_MS,
            } satisfies PollOutcome;
          }

          // Safety net: if a fresh connect's initializeWatermark probe
          // failed (e.g., 402/429 during signup), watermark stays null and
          // we'd otherwise enqueue the user's entire bookmark history on
          // the next successful poll. When watermark is null, pin it
          // without enqueuing — sync starts from now on.
          if (!state.watermarkTweetId) {
            yield* store.setWatermark(newestId).pipe(
              Effect.catchTag("XSyncStorageError", (e) =>
                Effect.logWarning("pollOnce: setWatermark failed").pipe(
                  Effect.annotateLogs({
                    userId,
                    op: e.op,
                    cause: String(e.cause),
                  })
                )
              )
            );
            yield* Effect.logInfo(
              "pollOnce: established watermark from first poll"
            ).pipe(
              Effect.annotateLogs({
                userId,
                xUserId: state.xUserId,
                watermark: newestId,
              })
            );
            yield* Effect.annotateCurrentSpan("newCount", 0);
            yield* Effect.annotateCurrentSpan("firstPoll", true);
            return {
              kind: "ok",
              newCount: 0,
              rescheduleInMs: POLL_INTERVAL_MS,
            } satisfies PollOutcome;
          }

          // Walk pagination until we hit the watermark or X stops yielding.
          // If pagination is truncated by an API error mid-walk, we MUST NOT
          // advance the watermark — otherwise we'd silently drop the
          // bookmarks on the unwalked pages forever.
          const collected: XBookmarkTweet[] = [...probe.data];
          let token = probe.nextToken;
          let pagesWalked = 1;
          let truncatedReason: string | null = null;

          while (
            token &&
            !collected.some((b) => b.id === state.watermarkTweetId)
          ) {
            const page = yield* api
              .getBookmarks({
                xUserId: state.xUserId,
                accessToken,
                maxResults: PAGINATION_PAGE_SIZE,
                paginationToken: token,
              })
              .pipe(
                Effect.catchTags({
                  XUnauthorizedError: (e) =>
                    Effect.logWarning("pollOnce: pagination truncated (401)")
                      .pipe(
                        Effect.annotateLogs({
                          userId,
                          xUserId: state.xUserId,
                          endpoint: e.endpoint,
                          pagesWalked,
                        })
                      )
                      .pipe(Effect.as({ truncated: "unauthorized" as const })),
                  XPaymentRequiredError: (e) =>
                    Effect.logWarning("pollOnce: pagination truncated (402)")
                      .pipe(
                        Effect.annotateLogs({
                          userId,
                          xUserId: state.xUserId,
                          endpoint: e.endpoint,
                          pagesWalked,
                        })
                      )
                      .pipe(
                        Effect.as({ truncated: "payment_required" as const })
                      ),
                  XRateLimitedError: (e) =>
                    Effect.logWarning("pollOnce: pagination truncated (429)")
                      .pipe(
                        Effect.annotateLogs({
                          userId,
                          xUserId: state.xUserId,
                          endpoint: e.endpoint,
                          retryAfterMs: e.retryAfterMs,
                          pagesWalked,
                        })
                      )
                      .pipe(Effect.as({ truncated: "rate_limited" as const })),
                  XApiError: (e) =>
                    Effect.logWarning("pollOnce: pagination truncated (api)")
                      .pipe(
                        Effect.annotateLogs({
                          userId,
                          xUserId: state.xUserId,
                          endpoint: e.endpoint,
                          status: e.status,
                          message: e.message,
                          pagesWalked,
                        })
                      )
                      .pipe(Effect.as({ truncated: "api_error" as const })),
                })
              );
            if ("truncated" in page) {
              truncatedReason = page.truncated;
              break;
            }
            collected.push(...page.data);
            token = page.nextToken;
            pagesWalked += 1;
          }

          yield* Effect.annotateCurrentSpan("pagesWalked", pagesWalked);
          if (truncatedReason) {
            yield* Effect.annotateCurrentSpan(
              "paginationTruncated",
              truncatedReason
            );
          }

          const watermarkFound = collected.some(
            (b) => b.id === state.watermarkTweetId
          );

          // If the walk terminated by error before reaching the watermark we
          // cannot safely advance — the next poll will re-walk and pick up
          // what we missed. Skip both enqueue and watermark write.
          if (truncatedReason && !watermarkFound) {
            yield* Effect.annotateCurrentSpan("newCount", 0);
            yield* Effect.logWarning(
              "pollOnce: pagination truncated before watermark — deferring"
            ).pipe(
              Effect.annotateLogs({
                userId,
                xUserId: state.xUserId,
                reason: truncatedReason,
                pagesWalked,
              })
            );
            return {
              kind: "ok",
              newCount: 0,
              rescheduleInMs: POLL_INTERVAL_MS,
            } satisfies PollOutcome;
          }

          const watermarkIdx = collected.findIndex(
            (b) => b.id === state.watermarkTweetId
          );
          const newOnes =
            watermarkIdx >= 0 ? collected.slice(0, watermarkIdx) : collected;

          if (newOnes.length > 0) {
            yield* enqueueBookmarksEffect(userId, [...newOnes].toReversed());
          }

          yield* store.setWatermark(newestId).pipe(
            Effect.catchTag("XSyncStorageError", (e) =>
              Effect.logWarning("pollOnce: setWatermark failed").pipe(
                Effect.annotateLogs({
                  userId,
                  op: e.op,
                  cause: String(e.cause),
                })
              )
            )
          );
          yield* Effect.annotateCurrentSpan("newCount", newOnes.length);

          return {
            kind: "ok",
            newCount: newOnes.length,
            rescheduleInMs: POLL_INTERVAL_MS,
          } satisfies PollOutcome;
        })
      ),
      Effect.catchTag("XRateLimitedError", (e) =>
        Effect.logWarning("pollOnce: rate limited")
          .pipe(
            Effect.annotateLogs({
              userId,
              xUserId: state.xUserId,
              retryAfterMs: e.retryAfterMs,
            })
          )
          .pipe(
            Effect.as<PollOutcome>({
              kind: "rate_limited",
              retryAfterMs: e.retryAfterMs,
            })
          )
      ),
      Effect.catchTag("XUnauthorizedError", () =>
        store.setStatus("needs_reconnect").pipe(
          Effect.catchTag("XSyncStorageError", (e) =>
            Effect.logWarning("pollOnce: setStatus failed").pipe(
              Effect.annotateLogs({ userId, op: e.op, cause: String(e.cause) })
            )
          ),
          Effect.tap(() =>
            Effect.logWarning("pollOnce: 401 from X, needs reconnect").pipe(
              Effect.annotateLogs({ userId, xUserId: state.xUserId })
            )
          ),
          Effect.as<PollOutcome>({ kind: "needs_reconnect" })
        )
      ),
      Effect.catchTag("XPaymentRequiredError", () =>
        store.setStatus("needs_reconnect").pipe(
          Effect.catchTag("XSyncStorageError", (e) =>
            Effect.logWarning("pollOnce: setStatus failed").pipe(
              Effect.annotateLogs({ userId, op: e.op, cause: String(e.cause) })
            )
          ),
          Effect.tap(() =>
            Effect.logWarning(
              "pollOnce: 402 from X (billing not configured), pausing"
            ).pipe(Effect.annotateLogs({ userId, xUserId: state.xUserId }))
          ),
          Effect.as<PollOutcome>({ kind: "needs_reconnect" })
        )
      )
    );
});
