import { Effect } from "effect";

import { OrgId, UserId, XTweetId, XUserId } from "../db/branded";
import { maskId } from "../log-utils";
import type {
  XApiFailure,
  XSyncSideEffectError,
  XSyncStorageError,
} from "./errors";
import type { XSyncReconnectReason } from "./reconnect-reason";
import type { BookmarksPage, XBookmarkTweet } from "./services";
import { XApiClient } from "./services";
import { LinkQueueClient } from "./services/link-queue-client";
import type {
  XSyncConnectedState,
  XSyncStateStoreShape,
} from "./services/x-sync-state-store";
import { XSyncStateStore } from "./services/x-sync-state-store";

const PAGINATION_PAGE_SIZE = 50;

export type PollOutcome =
  | { kind: "ok"; newCount: number }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "needs_reconnect" };

/**
 * Park the account, recording why. The reason is written first so a reader can
 * never observe `needs_reconnect` alongside a stale reason.
 */
const park = (
  store: XSyncStateStoreShape,
  reason: XSyncReconnectReason
): Effect.Effect<PollOutcome, XSyncStorageError> =>
  store
    .setReconnectReason(reason)
    .pipe(
      Effect.andThen(store.setStatus("needs_reconnect")),
      Effect.as<PollOutcome>({ kind: "needs_reconnect" })
    );

const enqueueOrderedEffect: (
  userId: UserId,
  orgId: OrgId,
  bookmarks: ReadonlyArray<XBookmarkTweet>,
  index: number,
  lastEnqueued: XTweetId | null
) => Effect.Effect<
  void,
  XSyncSideEffectError | XSyncStorageError,
  LinkQueueClient | XSyncStateStore
> = Effect.fnUntraced(
  function* (userId, orgId, bookmarks, index, lastEnqueued) {
    const bookmark = bookmarks[index];
    if (!bookmark) return;

    const queue = yield* LinkQueueClient;
    const store = yield* XSyncStateStore;
    yield* queue
      .send({
        url: `https://x.com/i/status/${bookmark.id}`,
        storeId: orgId,
        source: "x_bookmark",
        sourceMeta: JSON.stringify({
          tweetId: bookmark.id,
          authorId: bookmark.author_id,
          text: bookmark.text,
          createdAt: bookmark.created_at,
        }),
      })
      .pipe(
        Effect.tapErrorTag("XSyncSideEffectError", (error) =>
          Effect.logWarning("enqueueBookmarks: queue send failed").pipe(
            Effect.annotateLogs({
              userId: maskId(userId),
              tweetId: bookmark.id,
              cause: String(error.cause),
            })
          )
        ),
        Effect.catchTag("XSyncSideEffectError", (error) => {
          if (!lastEnqueued) return Effect.fail(error);
          return store
            .setWatermark(lastEnqueued)
            .pipe(Effect.andThen(Effect.fail(error)));
        })
      );
    return yield* enqueueOrderedEffect(
      userId,
      orgId,
      bookmarks,
      index + 1,
      bookmark.id
    );
  }
);

const enqueueBookmarksEffect = Effect.fn("XBookmarkSyncDO.enqueueBookmarks")(
  function* (
    userId: UserId,
    orgId: OrgId,
    bookmarks: ReadonlyArray<XBookmarkTweet>
  ) {
    yield* enqueueOrderedEffect(userId, orgId, bookmarks, 0, null);
    yield* Effect.annotateCurrentSpan("count", bookmarks.length);
    yield* Effect.annotateCurrentSpan("orgId", maskId(orgId));
    yield* Effect.logInfo("enqueueBookmarks").pipe(
      Effect.annotateLogs({
        userId: maskId(userId),
        orgId: maskId(orgId),
        count: bookmarks.length,
      })
    );
  }
);

interface BookmarkWalk {
  readonly bookmarks: ReadonlyArray<XBookmarkTweet>;
  readonly pagesWalked: number;
}

const beforeWatermark = (
  bookmarks: ReadonlyArray<XBookmarkTweet>,
  watermarkIndex: number
): ReadonlyArray<XBookmarkTweet> => {
  if (watermarkIndex < 0) return bookmarks;
  return bookmarks.slice(0, watermarkIndex);
};

const walkBookmarksEffect: (
  xUserId: XUserId,
  accessToken: string,
  watermarkTweetId: XTweetId,
  bookmarks: ReadonlyArray<XBookmarkTweet>,
  paginationToken: string | undefined,
  pagesWalked: number
) => Effect.Effect<BookmarkWalk, XApiFailure, XApiClient> = Effect.fnUntraced(
  function* (
    xUserId,
    accessToken,
    watermarkTweetId,
    bookmarks,
    paginationToken,
    pagesWalked
  ) {
    if (
      !paginationToken ||
      bookmarks.some((bookmark) => bookmark.id === watermarkTweetId)
    ) {
      return { bookmarks, pagesWalked };
    }

    const api = yield* XApiClient;
    const page = yield* api.getBookmarks({
      xUserId,
      accessToken,
      maxResults: PAGINATION_PAGE_SIZE,
      paginationToken,
    });

    return yield* walkBookmarksEffect(
      xUserId,
      accessToken,
      watermarkTweetId,
      [...bookmarks, ...page.data],
      page.nextToken,
      pagesWalked + 1
    );
  }
);

const processBookmarksEffect = Effect.fnUntraced(function* (
  userId: UserId,
  organizationId: OrgId,
  state: XSyncConnectedState,
  accessToken: string,
  probe: BookmarksPage
) {
  const store = yield* XSyncStateStore;
  const newestId = probe.data[0]?.id;
  if (!newestId || newestId === state.watermarkTweetId) {
    return {
      kind: "ok",
      newCount: 0,
    } satisfies PollOutcome;
  }

  if (!state.watermarkTweetId) {
    yield* store.setWatermark(newestId);
    return {
      kind: "ok",
      newCount: 0,
    } satisfies PollOutcome;
  }

  const walk = yield* walkBookmarksEffect(
    state.xUserId,
    accessToken,
    state.watermarkTweetId,
    probe.data,
    probe.nextToken,
    1
  );
  yield* Effect.annotateCurrentSpan("pagesWalked", walk.pagesWalked);

  const watermarkIndex = walk.bookmarks.findIndex(
    (bookmark) => bookmark.id === state.watermarkTweetId
  );
  const newBookmarks = beforeWatermark(walk.bookmarks, watermarkIndex);
  if (newBookmarks.length > 0) {
    yield* enqueueBookmarksEffect(
      userId,
      organizationId,
      newBookmarks.toReversed()
    );
  }
  yield* store.setWatermark(newestId);
  return {
    kind: "ok",
    newCount: newBookmarks.length,
  } satisfies PollOutcome;
});

export const pollReconciledEffect = Effect.fn("XBookmarkSyncDO.pollReconciled")(
  function* (
    userId: UserId,
    organizationId: OrgId,
    state: XSyncConnectedState,
    accessToken: string
  ) {
    yield* Effect.annotateCurrentSpan("userId", maskId(userId));
    const store = yield* XSyncStateStore;
    const api = yield* XApiClient;
    return yield* api
      .getBookmarks({
        xUserId: state.xUserId,
        accessToken,
        maxResults: 1,
      })
      .pipe(
        Effect.flatMap((probe) =>
          processBookmarksEffect(
            userId,
            organizationId,
            state,
            accessToken,
            probe
          )
        ),
        Effect.catchTag("XRateLimitedError", (error) =>
          Effect.succeed<PollOutcome>({
            kind: "rate_limited",
            retryAfterMs: error.retryAfterMs,
          })
        ),
        // Both park the account, but for different reasons. Record which, so
        // reconcile knows whether its getMe check can actually clear the park.
        Effect.catchTag("XUnauthorizedError", () => park(store, "auth")),
        Effect.catchTag("XPaymentRequiredError", () =>
          park(store, "access_level")
        )
      );
  }
);
