import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { UserId, XTweetId } from "../../db/branded";
import { initializeWatermarkEffect } from "../../x-sync/effects";
import {
  XApiError,
  XPaymentRequiredError,
  XRateLimitedError,
  XUnauthorizedError,
} from "../../x-sync/errors";
import {
  baseLayers,
  makeAuthLayer,
  makeQueueLayer,
  makeSnapshot,
  makeStoreLayer,
  makeXApiLayer,
  X_USER,
} from "../_helpers/x-sync";

const USER_ID = UserId.make("user-1");

describe("initializeWatermarkEffect", () => {
  it.effect(
    "REGRESSION (cost flood): with 800 existing bookmarks, pins watermark to current head WITHOUT enqueuing any",
    () => {
      // This is the scenario that previously could cause a $0.50 surprise +
      // 800x AI summary spend. The fix: pin watermark to newest, enqueue
      // nothing. Pagination MUST NOT be walked even when nextToken is set.
      const store = makeStoreLayer(makeSnapshot({ watermarkTweetId: null }));
      const x = makeXApiLayer([
        {
          kind: "ok",
          page: {
            data: [
              {
                id: XTweetId.make("tweet-800"),
                text: "newest",
                author_id: X_USER,
              },
            ],
            nextToken: "page2",
          },
        },
      ]);
      const queue = makeQueueLayer();

      return initializeWatermarkEffect(USER_ID).pipe(
        Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
        Effect.tap(() =>
          Effect.sync(() => {
            expect(store.rec.setWatermarkCalls).toEqual([
              XTweetId.make("tweet-800"),
            ]);
            expect(queue.calls).toEqual([]);
            expect(x.calls).toHaveLength(1);
            expect(x.calls[0]?.maxResults).toBe(1);
            expect(x.calls[0]?.paginationToken).toBeUndefined();
          })
        )
      );
    }
  );

  it.effect("empty bookmarks: no watermark pin, no error", () => {
    const store = makeStoreLayer(makeSnapshot({ watermarkTweetId: null }));
    const x = makeXApiLayer([
      { kind: "ok", page: { data: [], nextToken: undefined } },
    ]);
    const queue = makeQueueLayer();

    return initializeWatermarkEffect(USER_ID).pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(store.rec.setWatermarkCalls).toEqual([]);
          expect(store.rec.setStatusCalls).toEqual([]);
          expect(x.calls).toHaveLength(1);
        })
      )
    );
  });

  it.effect("no-op when store has no identity", () => {
    const store = makeStoreLayer(null);
    const x = makeXApiLayer([]);
    const queue = makeQueueLayer();

    return initializeWatermarkEffect(USER_ID).pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(x.calls).toEqual([]);
          expect(store.rec.setWatermarkCalls).toEqual([]);
        })
      )
    );
  });

  it.effect("no-op when no access token available", () => {
    const store = makeStoreLayer(makeSnapshot());
    const x = makeXApiLayer([]);
    const queue = makeQueueLayer();

    return initializeWatermarkEffect(USER_ID).pipe(
      Effect.provide(
        baseLayers(store.layer, x.layer, queue.layer, {
          auth: makeAuthLayer(null),
        })
      ),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(x.calls).toEqual([]);
          expect(store.rec.setWatermarkCalls).toEqual([]);
        })
      )
    );
  });

  it.effect("silently swallows 401 — next poll's safety net handles it", () => {
    const store = makeStoreLayer(makeSnapshot({ watermarkTweetId: null }));
    const x = makeXApiLayer([
      {
        kind: "fail",
        error: new XUnauthorizedError({ endpoint: "bookmarks" }),
      },
    ]);
    const queue = makeQueueLayer();

    return initializeWatermarkEffect(USER_ID).pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(store.rec.setWatermarkCalls).toEqual([]);
          expect(store.rec.setStatusCalls).toEqual([]);
        })
      )
    );
  });

  it.effect("silently swallows 402", () => {
    const store = makeStoreLayer(makeSnapshot({ watermarkTweetId: null }));
    const x = makeXApiLayer([
      {
        kind: "fail",
        error: new XPaymentRequiredError({ endpoint: "bookmarks" }),
      },
    ]);
    const queue = makeQueueLayer();

    return initializeWatermarkEffect(USER_ID).pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(store.rec.setWatermarkCalls).toEqual([]);
        })
      )
    );
  });

  it.effect("silently swallows 429", () => {
    const store = makeStoreLayer(makeSnapshot({ watermarkTweetId: null }));
    const x = makeXApiLayer([
      {
        kind: "fail",
        error: new XRateLimitedError({
          endpoint: "bookmarks",
          retryAfterMs: 60_000,
        }),
      },
    ]);
    const queue = makeQueueLayer();

    return initializeWatermarkEffect(USER_ID).pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(store.rec.setWatermarkCalls).toEqual([]);
        })
      )
    );
  });

  it.effect("silently swallows generic XApiError", () => {
    const store = makeStoreLayer(makeSnapshot({ watermarkTweetId: null }));
    const x = makeXApiLayer([
      {
        kind: "fail",
        error: new XApiError({
          endpoint: "bookmarks",
          status: 503,
          message: "service unavailable",
        }),
      },
    ]);
    const queue = makeQueueLayer();

    return initializeWatermarkEffect(USER_ID).pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(store.rec.setWatermarkCalls).toEqual([]);
        })
      )
    );
  });
});
