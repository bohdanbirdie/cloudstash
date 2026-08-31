import { Clock, Effect } from "effect";

import type { MonthlyUsageWindow } from "../billing/usage-cycle";
import { OrgId, UserId, XTweetId, XUserId } from "../db/branded";
import { maskId } from "../log-utils";
import type { XSyncStorageError } from "./errors";
import type { XSyncReconnectReason } from "./reconnect-reason";
import type { BookmarksPage, XBookmarkTweet } from "./services";
import { XApiClient } from "./services";
import { LinkQueueClient } from "./services/link-queue-client";
import type {
  XSyncConnectedState,
  XSyncReadUsage,
  XSyncScanState,
  XSyncStateStoreShape,
} from "./services/x-sync-state-store";
import { XSyncStateStore } from "./services/x-sync-state-store";

export const X_CHECKPOINT_RING_SIZE = 16;
export const X_PROVIDER_REQUESTS_PER_POLL = 25;
export const X_PROVIDER_READ_BUFFER = 50;

export type PollOutcome =
  | { kind: "ok"; newCount: number }
  | { kind: "continuing" }
  | { kind: "monthly_limit"; retryAfterMs: number }
  | { kind: "rate_limited"; retryAfterMs: number }
  | { kind: "needs_reconnect" };

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

const uniqueTweetIds = (
  ids: readonly XTweetId[],
  limit = X_CHECKPOINT_RING_SIZE
): readonly XTweetId[] => [...new Set(ids)].slice(0, limit);

const checkpointsFor = Effect.fnUntraced(function* (
  state: XSyncConnectedState
) {
  const store = yield* XSyncStateStore;
  const persisted = yield* store.readCheckpoints();
  return uniqueTweetIds([
    ...persisted,
    ...(state.watermarkTweetId ? [state.watermarkTweetId] : []),
  ]);
});

const readUsageFor = Effect.fnUntraced(function* (
  usageWindow: MonthlyUsageWindow
) {
  const store = yield* XSyncStateStore;
  const persisted = yield* store.readReadUsage();
  if (persisted?.windowId === usageWindow.id) return persisted;
  return {
    windowId: usageWindow.id,
    billableKeys: [],
  } satisfies XSyncReadUsage;
});

const readKey = (tweetId: XTweetId, now: Date): string =>
  `${now.toISOString().slice(0, 10)}:${tweetId}`;

const recordProviderReads = Effect.fnUntraced(function* (
  usage: XSyncReadUsage,
  page: BookmarksPage
) {
  const store = yield* XSyncStateStore;
  const now = yield* Clock.currentTimeMillis;
  const nextKeys = [
    ...new Set([
      ...usage.billableKeys,
      ...page.data.map((bookmark) => readKey(bookmark.id, new Date(now))),
    ]),
  ];
  if (nextKeys.length === usage.billableKeys.length) return usage;
  const next = { ...usage, billableKeys: nextKeys } satisfies XSyncReadUsage;
  yield* store.setReadUsage(next);
  return next;
});

const retryAfterReset = Effect.fnUntraced(function* (
  usageWindow: MonthlyUsageWindow
) {
  const now = yield* Clock.currentTimeMillis;
  return Math.max(1_000, Date.parse(usageWindow.resetsAt) - now + 1_000);
});

const beforeCheckpoint = (
  page: BookmarksPage,
  checkpoints: ReadonlySet<XTweetId>
): {
  readonly bookmarks: readonly XBookmarkTweet[];
  readonly reached: boolean;
} => {
  const index = page.data.findIndex((bookmark) => checkpoints.has(bookmark.id));
  if (index === -1) return { bookmarks: page.data, reached: false };
  return { bookmarks: page.data.slice(0, index), reached: true };
};

interface ScanProgress {
  readonly scan: XSyncScanState;
  readonly usage: XSyncReadUsage;
  readonly readLimitReached: boolean;
}

const advanceScan = Effect.fnUntraced(function* (
  xUserId: XUserId,
  accessToken: string,
  checkpoints: ReadonlySet<XTweetId>,
  initialScan: XSyncScanState,
  initialUsage: XSyncReadUsage,
  readLimit: number
) {
  const api = yield* XApiClient;
  const store = yield* XSyncStateStore;
  let scan = initialScan;
  let usage = initialUsage;
  let requests = 0;

  while (!scan.complete && requests < X_PROVIDER_REQUESTS_PER_POLL) {
    if (!scan.nextToken) {
      scan = { ...scan, complete: true };
      break;
    }
    if (usage.billableKeys.length >= readLimit) {
      return {
        scan,
        usage,
        readLimitReached: true,
      } satisfies ScanProgress;
    }

    const page = yield* api.getBookmarks({
      xUserId,
      accessToken,
      maxResults: 1,
      paginationToken: scan.nextToken,
    });
    usage = yield* recordProviderReads(usage, page);
    const pagePrefix = beforeCheckpoint(page, checkpoints);
    scan = {
      ...scan,
      bookmarks: [...scan.bookmarks, ...pagePrefix.bookmarks],
      nextToken: pagePrefix.reached ? null : (page.nextToken ?? null),
      complete: pagePrefix.reached || page.nextToken === undefined,
    };
    yield* store.setScan(scan);
    requests += 1;
  }

  return { scan, usage, readLimitReached: false } satisfies ScanProgress;
});

const queueMessage = (organizationId: OrgId, bookmark: XBookmarkTweet) => ({
  url: `https://x.com/i/status/${bookmark.id}`,
  storeId: organizationId,
  source: "x_bookmark",
  sourceMeta: JSON.stringify({
    tweetId: bookmark.id,
    authorId: bookmark.author_id,
    text: bookmark.text,
    createdAt: bookmark.created_at,
  }),
});

const drainScan = Effect.fn("XBookmarkSyncDO.drainScan")(function* (
  userId: UserId,
  organizationId: OrgId,
  scan: XSyncScanState,
  previousCheckpoints: readonly XTweetId[],
  usageWindow: MonthlyUsageWindow,
  monthlyLimit: number
) {
  const store = yield* XSyncStateStore;
  const queue = yield* LinkQueueClient;
  const ordered = scan.bookmarks.toReversed();
  let enqueued = 0;
  const processedIds: XTweetId[] = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const bookmark = ordered[index];
    if (!bookmark) continue;
    const outcome = yield* queue
      .send({
        organizationId,
        usageWindowId: usageWindow.id,
        monthlyLimit,
        tweetId: bookmark.id,
        message: queueMessage(organizationId, bookmark),
      })
      .pipe(
        Effect.tapError((error) =>
          Effect.logWarning("enqueueBookmarks: queue send failed").pipe(
            Effect.annotateLogs({
              userId: maskId(userId),
              tweetId: bookmark.id,
              cause: String(error.cause),
            })
          )
        ),
        Effect.catchTag("XSyncSideEffectError", (error) =>
          store
            .setCheckpoints(
              uniqueTweetIds([
                ...processedIds.toReversed(),
                ...previousCheckpoints,
              ])
            )
            .pipe(Effect.andThen(Effect.fail(error)))
        )
      );

    if (outcome === "limit_reached") {
      const remaining = ordered.slice(index).toReversed();
      yield* store.setCheckpoints(
        uniqueTweetIds([...processedIds.toReversed(), ...previousCheckpoints])
      );
      yield* store.setScan({ ...scan, bookmarks: remaining, complete: true });
      return {
        kind: "monthly_limit",
        retryAfterMs: yield* retryAfterReset(usageWindow),
      } satisfies PollOutcome;
    }
    if (outcome === "enqueued") enqueued += 1;
    processedIds.push(bookmark.id);
  }

  const checkpoints = uniqueTweetIds([
    scan.headTweetId,
    ...scan.bookmarks.map((bookmark) => bookmark.id),
    ...previousCheckpoints,
  ]);
  yield* store.setCheckpoints(checkpoints);
  yield* store.setWatermark(scan.headTweetId);
  yield* store.clearScan();
  yield* Effect.annotateCurrentSpan({
    count: enqueued,
    orgId: maskId(organizationId),
  });
  yield* Effect.logInfo("enqueueBookmarks").pipe(
    Effect.annotateLogs({
      userId: maskId(userId),
      orgId: maskId(organizationId),
      count: enqueued,
    })
  );
  return { kind: "ok", newCount: enqueued } satisfies PollOutcome;
});

const startScan = (
  probe: BookmarksPage,
  checkpoints: ReadonlySet<XTweetId>
): XSyncScanState | null => {
  const newestId = probe.data[0]?.id;
  if (!newestId) return null;
  const prefix = beforeCheckpoint(probe, checkpoints);
  return {
    headTweetId: newestId,
    bookmarks: prefix.bookmarks,
    nextToken: prefix.reached ? null : (probe.nextToken ?? null),
    complete: prefix.reached || probe.nextToken === undefined,
  };
};

const pollConnected = Effect.fnUntraced(function* (
  userId: UserId,
  organizationId: OrgId,
  state: XSyncConnectedState,
  accessToken: string,
  usageWindow: MonthlyUsageWindow,
  monthlyLimit: number
) {
  const store = yield* XSyncStateStore;
  const api = yield* XApiClient;
  const checkpoints = yield* checkpointsFor(state);
  const checkpointSet = new Set(checkpoints);
  let usage = yield* readUsageFor(usageWindow);
  const readLimit = monthlyLimit + X_PROVIDER_READ_BUFFER;
  let scan = yield* store.readScan();

  if (!scan) {
    if (usage.billableKeys.length >= readLimit) {
      return {
        kind: "monthly_limit",
        retryAfterMs: yield* retryAfterReset(usageWindow),
      } satisfies PollOutcome;
    }
    const probe = yield* api.getBookmarks({
      xUserId: state.xUserId,
      accessToken,
      maxResults: 1,
    });
    usage = yield* recordProviderReads(usage, probe);
    const newestId = probe.data[0]?.id;
    if (!newestId || checkpointSet.has(newestId)) {
      return { kind: "ok", newCount: 0 } satisfies PollOutcome;
    }
    if (checkpoints.length === 0) {
      yield* store.setCheckpoints([newestId]);
      yield* store.setWatermark(newestId);
      return { kind: "ok", newCount: 0 } satisfies PollOutcome;
    }
    scan = startScan(probe, checkpointSet);
    if (!scan) return { kind: "ok", newCount: 0 } satisfies PollOutcome;
    yield* store.setScan(scan);
  }

  const progress = yield* advanceScan(
    state.xUserId,
    accessToken,
    checkpointSet,
    scan,
    usage,
    readLimit
  );
  yield* store.setScan(progress.scan);
  if (progress.readLimitReached) {
    return {
      kind: "monthly_limit",
      retryAfterMs: yield* retryAfterReset(usageWindow),
    } satisfies PollOutcome;
  }
  if (!progress.scan.complete) {
    return { kind: "continuing" } satisfies PollOutcome;
  }
  return yield* drainScan(
    userId,
    organizationId,
    progress.scan,
    checkpoints,
    usageWindow,
    monthlyLimit
  );
});

export const pollReconciledEffect = Effect.fn("XBookmarkSyncDO.pollReconciled")(
  function* (
    userId: UserId,
    organizationId: OrgId,
    state: XSyncConnectedState,
    accessToken: string,
    usageWindow: MonthlyUsageWindow,
    monthlyLimit: number
  ) {
    yield* Effect.annotateCurrentSpan("userId", maskId(userId));
    const store = yield* XSyncStateStore;
    return yield* pollConnected(
      userId,
      organizationId,
      state,
      accessToken,
      usageWindow,
      monthlyLimit
    ).pipe(
      Effect.catchTag("XRateLimitedError", (error) =>
        Effect.succeed<PollOutcome>({
          kind: "rate_limited",
          retryAfterMs: error.retryAfterMs,
        })
      ),
      Effect.catchTag("XUnauthorizedError", () => park(store, "auth")),
      Effect.catchTag("XPaymentRequiredError", () =>
        park(store, "access_level")
      )
    );
  }
);
