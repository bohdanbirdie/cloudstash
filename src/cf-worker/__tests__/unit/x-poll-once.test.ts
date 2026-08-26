import { describe, it } from "@effect/vitest";
import { Effect, Result, Schema } from "effect";
import { expect } from "vitest";

import { UserId, XTweetId, XUserId } from "../../db/branded";
import {
  XApiError,
  XPaymentRequiredError,
  XRateLimitedError,
  XUnauthorizedError,
} from "../../x-sync/errors";
import { pollReconciledEffect } from "../../x-sync/poll";
import { XSyncStateStore } from "../../x-sync/services/x-sync-state-store";
import {
  baseLayers,
  makeQueueLayer,
  makeSnapshot,
  makeStoreLayer,
  makeXApiLayer,
  ORG_ID,
  X_USER,
} from "../_helpers/x-sync";

const USER_ID = UserId.make("user-1");
const tweet = (id: string) => ({
  id: XTweetId.make(id),
  text: id,
  author_id: X_USER,
});
const QueueSourceMeta = Schema.Struct({
  tweetId: XTweetId,
  authorId: XUserId,
  text: Schema.String,
  createdAt: Schema.optionalKey(Schema.String),
});

const poll = Effect.fnUntraced(function* () {
  const store = yield* XSyncStateStore;
  const state = yield* store.read();
  if (!state || !state.xUserId) {
    return yield* Effect.die("test poll requires connected state");
  }
  return yield* pollReconciledEffect(USER_ID, ORG_ID, state, "access-token");
});

describe("pollReconciledEffect", () => {
  it.effect("returns newCount:0 when probe newestId === watermark", () => {
    const store = makeStoreLayer(
      makeSnapshot({ watermarkTweetId: XTweetId.make("t1") })
    );
    const x = makeXApiLayer([
      {
        kind: "ok",
        page: { data: [tweet("t1")], nextToken: undefined },
      },
    ]);
    const queue = makeQueueLayer();

    return poll().pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.tap((outcome) =>
        Effect.sync(() => {
          expect(outcome).toEqual({
            kind: "ok",
            newCount: 0,
            rescheduleInMs: 30_000,
          });
          expect(queue.calls).toEqual([]);
          expect(x.calls).toHaveLength(1);
          expect(x.calls[0]?.maxResults).toBe(1);
          expect(store.rec.setWatermarkCalls).toEqual([]);
        })
      )
    );
  });

  it.effect(
    "first-poll guard: pins watermark without enqueuing when watermark is null (regression for the cost-flood bug)",
    () => {
      const store = makeStoreLayer(makeSnapshot({ watermarkTweetId: null }));
      const x = makeXApiLayer([
        {
          kind: "ok",
          page: { data: [tweet("t999")], nextToken: undefined },
        },
      ]);
      const queue = makeQueueLayer();

      return poll().pipe(
        Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
        Effect.tap((outcome) =>
          Effect.sync(() => {
            expect(outcome).toMatchObject({ kind: "ok", newCount: 0 });
            expect(queue.calls).toEqual([]);
            expect(store.rec.setWatermarkCalls).toEqual([
              XTweetId.make("t999"),
            ]);
          })
        )
      );
    }
  );

  it.effect(
    "paginated new bookmarks: walks pages with max_results=50, slices at watermark, enqueues in reverse order with full payload",
    () => {
      const store = makeStoreLayer(
        makeSnapshot({ watermarkTweetId: XTweetId.make("t1") })
      );
      const x = makeXApiLayer([
        { kind: "ok", page: { data: [tweet("t5")], nextToken: "page2" } },
        {
          kind: "ok",
          page: {
            data: [tweet("t4"), tweet("t3"), tweet("t2"), tweet("t1")],
            nextToken: undefined,
          },
        },
      ]);
      const queue = makeQueueLayer();

      return poll().pipe(
        Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
        Effect.tap((outcome) =>
          Effect.sync(() => {
            expect(outcome).toMatchObject({ kind: "ok", newCount: 4 });
            expect(queue.calls.map((q) => q.url)).toEqual([
              "https://x.com/i/status/t2",
              "https://x.com/i/status/t3",
              "https://x.com/i/status/t4",
              "https://x.com/i/status/t5",
            ]);
            for (const q of queue.calls) {
              expect(q.storeId).toBe(ORG_ID);
              expect(q.source).toBe("x_bookmark");
              if (!q.sourceMeta) throw new Error("sourceMeta is required");
              const meta = Schema.decodeUnknownSync(QueueSourceMeta)(
                JSON.parse(q.sourceMeta)
              );
              expect(meta).toHaveProperty("tweetId");
              expect(meta).toHaveProperty("authorId");
              expect(meta).toHaveProperty("text");
            }
            expect(store.rec.setWatermarkCalls).toEqual([XTweetId.make("t5")]);
            expect(x.calls).toHaveLength(2);
            expect(x.calls[1]?.maxResults).toBe(50);
            expect(x.calls[1]?.paginationToken).toBe("page2");
          })
        )
      );
    }
  );

  it.effect(
    "checkpoints successful sends and retries the failed bookmark without duplicates",
    () => {
      const store = makeStoreLayer(
        makeSnapshot({ watermarkTweetId: XTweetId.make("t1") })
      );
      const x = makeXApiLayer([
        { kind: "ok", page: { data: [tweet("t3")], nextToken: "page2" } },
        {
          kind: "ok",
          page: {
            data: [tweet("t2"), tweet("t1")],
            nextToken: undefined,
          },
        },
        { kind: "ok", page: { data: [tweet("t3")], nextToken: "retry" } },
        {
          kind: "ok",
          page: { data: [tweet("t2")], nextToken: undefined },
        },
      ]);
      const queue = makeQueueLayer({ failAtCalls: new Set([1]) });

      const program = Effect.gen(function* () {
        const error = yield* Effect.flip(poll());

        expect(error._tag).toBe("XSyncSideEffectError");
        expect(queue.calls.map((call) => call.url)).toEqual([
          "https://x.com/i/status/t2",
          "https://x.com/i/status/t3",
        ]);
        expect(store.rec.setWatermarkCalls).toEqual([XTweetId.make("t2")]);

        const retried = yield* poll();
        expect(retried).toMatchObject({ kind: "ok", newCount: 1 });
        expect(queue.calls.map((call) => call.url)).toEqual([
          "https://x.com/i/status/t2",
          "https://x.com/i/status/t3",
          "https://x.com/i/status/t3",
        ]);
        expect(store.rec.setWatermarkCalls).toEqual([
          XTweetId.make("t2"),
          XTweetId.make("t3"),
        ]);
      });

      return program.pipe(
        Effect.provide(baseLayers(store.layer, x.layer, queue.layer))
      );
    }
  );

  it.effect(
    "multi-page walk: 3 pages, all newOnes enqueued reverse-chronologically",
    () => {
      const store = makeStoreLayer(
        makeSnapshot({ watermarkTweetId: XTweetId.make("t2") })
      );
      const x = makeXApiLayer([
        { kind: "ok", page: { data: [tweet("t10")], nextToken: "p2" } },
        {
          kind: "ok",
          page: {
            data: [tweet("t9"), tweet("t8"), tweet("t7"), tweet("t6")],
            nextToken: "p3",
          },
        },
        {
          kind: "ok",
          page: {
            data: [tweet("t5"), tweet("t4"), tweet("t3"), tweet("t2")],
            nextToken: "unused-after-watermark",
          },
        },
      ]);
      const queue = makeQueueLayer();

      return poll().pipe(
        Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
        Effect.tap((outcome) =>
          Effect.sync(() => {
            expect(outcome).toMatchObject({ kind: "ok", newCount: 8 });
            expect(queue.calls.map((q) => q.url)).toEqual(
              ["t3", "t4", "t5", "t6", "t7", "t8", "t9", "t10"].map(
                (id) => `https://x.com/i/status/${id}`
              )
            );
            expect(store.rec.setWatermarkCalls).toEqual([XTweetId.make("t10")]);
            expect(x.calls).toHaveLength(3);
          })
        )
      );
    }
  );

  it.effect(
    "in-walk error: probe ok then walk-page-2 fails 429 — NO watermark advance, NO enqueue (bookmarks deferred)",
    () => {
      const store = makeStoreLayer(
        makeSnapshot({ watermarkTweetId: XTweetId.make("t1") })
      );
      const x = makeXApiLayer([
        { kind: "ok", page: { data: [tweet("t10")], nextToken: "p2" } },
        {
          kind: "fail",
          error: new XRateLimitedError({
            endpoint: "bookmarks",
            retryAfterMs: 60_000,
          }),
        },
      ]);
      const queue = makeQueueLayer();

      return poll().pipe(
        Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
        Effect.tap((outcome) =>
          Effect.sync(() => {
            expect(outcome).toEqual({
              kind: "rate_limited",
              retryAfterMs: 60_000,
            });
            expect(queue.calls).toEqual([]);
            expect(store.rec.setWatermarkCalls).toEqual([]);
          })
        )
      );
    }
  );

  it.effect("returns rate_limited outcome on 429 probe", () => {
    const store = makeStoreLayer(
      makeSnapshot({ watermarkTweetId: XTweetId.make("t1") })
    );
    const x = makeXApiLayer([
      {
        kind: "fail",
        error: new XRateLimitedError({
          endpoint: "bookmarks",
          retryAfterMs: 45_000,
        }),
      },
    ]);
    const queue = makeQueueLayer();

    return poll().pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.tap((outcome) =>
        Effect.sync(() => {
          expect(outcome).toEqual({
            kind: "rate_limited",
            retryAfterMs: 45_000,
          });
          expect(queue.calls).toEqual([]);
          expect(store.rec.setStatusCalls).toEqual([]);
        })
      )
    );
  });

  it.effect("401 marks status needs_reconnect and returns that outcome", () => {
    const store = makeStoreLayer(
      makeSnapshot({ watermarkTweetId: XTweetId.make("t1") })
    );
    const x = makeXApiLayer([
      {
        kind: "fail",
        error: new XUnauthorizedError({ endpoint: "bookmarks" }),
      },
    ]);
    const queue = makeQueueLayer();

    return poll().pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.tap((outcome) =>
        Effect.sync(() => {
          expect(outcome).toEqual({ kind: "needs_reconnect" });
          expect(store.rec.setStatusCalls).toEqual(["needs_reconnect"]);
        })
      )
    );
  });

  it.effect(
    "402 marks status needs_reconnect (billing failures must not retry forever)",
    () => {
      const store = makeStoreLayer(
        makeSnapshot({ watermarkTweetId: XTweetId.make("t1") })
      );
      const x = makeXApiLayer([
        {
          kind: "fail",
          error: new XPaymentRequiredError({ endpoint: "bookmarks" }),
        },
      ]);
      const queue = makeQueueLayer();

      return poll().pipe(
        Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
        Effect.tap((outcome) =>
          Effect.sync(() => {
            expect(outcome).toEqual({ kind: "needs_reconnect" });
            expect(store.rec.setStatusCalls).toEqual(["needs_reconnect"]);
          })
        )
      );
    }
  );

  it.effect("empty bookmarks (no newestId) returns newCount:0", () => {
    const store = makeStoreLayer(makeSnapshot({ watermarkTweetId: null }));
    const x = makeXApiLayer([
      { kind: "ok", page: { data: [], nextToken: undefined } },
    ]);
    const queue = makeQueueLayer();

    return poll().pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.tap((outcome) =>
        Effect.sync(() => {
          expect(outcome).toMatchObject({ kind: "ok", newCount: 0 });
          expect(store.rec.setWatermarkCalls).toEqual([]);
        })
      )
    );
  });

  it.effect("XApiError on probe propagates (DO handles backoff)", () => {
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

    return poll().pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.result,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) {
            expect(result.failure).toBeInstanceOf(XApiError);
            if (!(result.failure instanceof XApiError)) {
              throw new Error("expected XApiError");
            }
            expect(result.failure.status).toBe(503);
          }
          expect(store.rec.setWatermarkCalls).toEqual([]);
        })
      )
    );
  });
});
