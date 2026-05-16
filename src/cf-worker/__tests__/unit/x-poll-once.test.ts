import { describe, it } from "@effect/vitest";
import { Effect, Either } from "effect";
import { expect } from "vitest";

import { UserId, XTweetId } from "../../db/branded";
import { pollOnceEffect } from "../../x-sync/effects";
import {
  NoAccessTokenError,
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
  ORG_ID,
  X_USER,
} from "../_helpers/x-sync";

const USER_ID = UserId.make("user-1");
const tweet = (id: string) => ({
  id: XTweetId.make(id),
  text: id,
  author_id: X_USER,
});

describe("pollOnceEffect", () => {
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

    return pollOnceEffect(USER_ID).pipe(
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
    "watermark idempotence with nextToken: returns ok WITHOUT walking pages when probe matches",
    () => {
      // Guards the early-return shortcut on `newestId === watermarkTweetId`
      // — even if `nextToken` is set, we must NOT walk pagination.
      const store = makeStoreLayer(
        makeSnapshot({ watermarkTweetId: XTweetId.make("t1") })
      );
      const x = makeXApiLayer([
        {
          kind: "ok",
          page: { data: [tweet("t1")], nextToken: "page2" },
        },
      ]);
      const queue = makeQueueLayer();

      return pollOnceEffect(USER_ID).pipe(
        Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
        Effect.tap(() =>
          Effect.sync(() => {
            expect(x.calls).toHaveLength(1);
            expect(queue.calls).toEqual([]);
            expect(store.rec.setWatermarkCalls).toEqual([]);
          })
        )
      );
    }
  );

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

      return pollOnceEffect(USER_ID).pipe(
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
        // Probe (maxResults:1)
        { kind: "ok", page: { data: [tweet("t5")], nextToken: "page2" } },
        // Walk page (maxResults:50 — research-driven cap)
        {
          kind: "ok",
          page: {
            data: [tweet("t4"), tweet("t3"), tweet("t2"), tweet("t1")],
            nextToken: undefined,
          },
        },
      ]);
      const queue = makeQueueLayer();

      return pollOnceEffect(USER_ID).pipe(
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
            // Queue payload shape: every message carries storeId, source, sourceMeta
            for (const q of queue.calls) {
              expect(q.storeId).toBe(ORG_ID);
              expect(q.source).toBe("x_bookmark");
              const meta = JSON.parse(q.sourceMeta) as Record<string, unknown>;
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
            nextToken: undefined,
          },
        },
      ]);
      const queue = makeQueueLayer();

      return pollOnceEffect(USER_ID).pipe(
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

      return pollOnceEffect(USER_ID).pipe(
        Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
        Effect.tap((outcome) =>
          Effect.sync(() => {
            expect(outcome).toMatchObject({ kind: "ok", newCount: 0 });
            // Critical: pagination was truncated before we found the
            // watermark, so we MUST defer — neither enqueue nor advance.
            expect(queue.calls).toEqual([]);
            expect(store.rec.setWatermarkCalls).toEqual([]);
          })
        )
      );
    }
  );

  it.effect(
    "in-walk error after finding watermark (which can't really happen) is safe — but guarded anyway",
    () => {
      // Edge case: probe + walk-page-1 cover everything back to the watermark
      // in one go; no second walk page is even attempted.
      const store = makeStoreLayer(
        makeSnapshot({ watermarkTweetId: XTweetId.make("t1") })
      );
      const x = makeXApiLayer([
        { kind: "ok", page: { data: [tweet("t3")], nextToken: "p2" } },
        {
          kind: "ok",
          page: {
            data: [tweet("t2"), tweet("t1")],
            nextToken: "p3", // there *would* be more, but watermark is found
          },
        },
      ]);
      const queue = makeQueueLayer();

      return pollOnceEffect(USER_ID).pipe(
        Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
        Effect.tap((outcome) =>
          Effect.sync(() => {
            expect(outcome).toMatchObject({ kind: "ok", newCount: 2 });
            expect(queue.calls.map((q) => q.url)).toEqual([
              "https://x.com/i/status/t2",
              "https://x.com/i/status/t3",
            ]);
            expect(x.calls).toHaveLength(2); // stops after watermark in page
          })
        )
      );
    }
  );

  it.effect(
    "no orgId for user: skips enqueue but still advances watermark",
    () => {
      const store = makeStoreLayer(
        makeSnapshot({ watermarkTweetId: XTweetId.make("t1") })
      );
      const x = makeXApiLayer([
        { kind: "ok", page: { data: [tweet("t2")], nextToken: undefined } },
      ]);
      const queue = makeQueueLayer();

      return pollOnceEffect(USER_ID).pipe(
        Effect.provide(
          baseLayers(store.layer, x.layer, queue.layer, { orgId: null })
        ),
        Effect.tap((outcome) =>
          Effect.sync(() => {
            expect(outcome).toMatchObject({ kind: "ok", newCount: 1 });
            // No org → enqueue is a no-op (logged)
            expect(queue.calls).toEqual([]);
            // …but the watermark still advances so next poll doesn't re-fetch
            expect(store.rec.setWatermarkCalls).toEqual([XTweetId.make("t2")]);
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

    return pollOnceEffect(USER_ID).pipe(
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

    return pollOnceEffect(USER_ID).pipe(
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

      return pollOnceEffect(USER_ID).pipe(
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

    return pollOnceEffect(USER_ID).pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.tap((outcome) =>
        Effect.sync(() => {
          expect(outcome).toMatchObject({ kind: "ok", newCount: 0 });
          expect(store.rec.setWatermarkCalls).toEqual([]);
        })
      )
    );
  });

  it.effect("not_initialized when store is empty", () => {
    const store = makeStoreLayer(null);
    const x = makeXApiLayer([]);
    const queue = makeQueueLayer();

    return pollOnceEffect(USER_ID).pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.tap((outcome) =>
        Effect.sync(() => {
          expect(outcome).toEqual({ kind: "not_initialized" });
          expect(x.calls).toEqual([]);
        })
      )
    );
  });

  it.effect(
    "no access token: fails with NoAccessTokenError + marks status",
    () => {
      const store = makeStoreLayer(makeSnapshot());
      const x = makeXApiLayer([]);
      const queue = makeQueueLayer();

      return pollOnceEffect(USER_ID).pipe(
        Effect.provide(
          baseLayers(store.layer, x.layer, queue.layer, {
            auth: makeAuthLayer(null),
          })
        ),
        Effect.either,
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(Either.isLeft(result)).toBe(true);
            if (Either.isLeft(result)) {
              expect(result.left).toBeInstanceOf(NoAccessTokenError);
              expect(result.left._tag).toBe("NoAccessTokenError");
              // userId context preserved on the tagged error
              expect((result.left as NoAccessTokenError).userId).toBe(USER_ID);
            }
            expect(store.rec.setStatusCalls).toEqual(["needs_reconnect"]);
          })
        )
      );
    }
  );

  it.effect("XApiError on probe propagates (DO handles backoff)", () => {
    // The DO's alarmEffect catches XApiError; pollOnceEffect itself should
    // surface it as the typed failure so the caller decides the policy.
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

    return pollOnceEffect(USER_ID).pipe(
      Effect.provide(baseLayers(store.layer, x.layer, queue.layer)),
      Effect.either,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left).toBeInstanceOf(XApiError);
            expect((result.left as XApiError).status).toBe(503);
          }
          expect(store.rec.setWatermarkCalls).toEqual([]);
        })
      )
    );
  });
});
