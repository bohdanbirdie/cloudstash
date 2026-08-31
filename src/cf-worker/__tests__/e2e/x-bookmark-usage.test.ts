import { env, runInDurableObject } from "cloudflare:test";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { OrgId, XTweetId } from "../../db/branded";
import { DURABLE_OBJECT_RETIRED_KEY } from "../../durable-object-retirement";
import type { LinkProcessorDO } from "../../link-processor/durable-object";
import { X_BOOKMARK_QUEUE_TEST_OVERRIDE } from "../../link-processor/durable-object";
import { XBookmarkQueue } from "../../link-processor/services";

const deferredPromise = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

describe("X bookmark monthly usage", () => {
  it("admits idempotently and enforces the workspace limit", async () => {
    const orgId = OrgId.make(`x-usage-${crypto.randomUUID()}`);
    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(orgId)
    );
    const usageWindowId = "2026-08-01T00:00:00.000Z";
    const message = (tweetId: XTweetId) => ({
      url: `https://x.com/i/status/${tweetId}`,
      storeId: orgId,
      source: "x_bookmark",
      sourceMeta: null,
    });

    expect(
      await processor.enqueueXBookmark(
        usageWindowId,
        XTweetId.make("tweet-1"),
        2,
        message(XTweetId.make("tweet-1"))
      )
    ).toBe("enqueued");
    expect(
      await processor.enqueueXBookmark(
        usageWindowId,
        XTweetId.make("tweet-1"),
        2,
        message(XTweetId.make("tweet-1"))
      )
    ).toBe("duplicate");
    expect(
      await processor.enqueueXBookmark(
        usageWindowId,
        XTweetId.make("tweet-2"),
        2,
        message(XTweetId.make("tweet-2"))
      )
    ).toBe("enqueued");
    expect(
      await processor.enqueueXBookmark(
        usageWindowId,
        XTweetId.make("tweet-3"),
        2,
        message(XTweetId.make("tweet-3"))
      )
    ).toBe("limit_reached");

    expect(await processor.getXBookmarkUsage(usageWindowId)).toEqual({
      count: 2,
    });
  });

  it("serializes concurrent workspace admission and source deduplication", async () => {
    const orgId = OrgId.make(`x-usage-concurrent-${crypto.randomUUID()}`);
    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(orgId)
    );
    const message = (tweetId: XTweetId) => ({
      url: `https://x.com/i/status/${tweetId}`,
      storeId: orgId,
      source: "x_bookmark",
      sourceMeta: null,
    });
    const windowId = "2026-08-01T00:00:00.000Z";
    const tweetIds = Array.from({ length: 8 }, (_, index) =>
      XTweetId.make(`concurrent-${index}`)
    );

    const outcomes = await Promise.all(
      tweetIds.map((tweetId) =>
        processor.enqueueXBookmark(windowId, tweetId, 3, message(tweetId))
      )
    );
    expect(outcomes.filter((outcome) => outcome === "enqueued")).toHaveLength(
      3
    );
    expect(
      outcomes.filter((outcome) => outcome === "limit_reached")
    ).toHaveLength(5);
    expect(await processor.getXBookmarkUsage(windowId)).toEqual({ count: 3 });

    const duplicateWindow = "2026-09-01T00:00:00.000Z";
    const duplicateId = XTweetId.make("same-tweet");
    const duplicateOutcomes = await Promise.all(
      Array.from({ length: 5 }, () =>
        processor.enqueueXBookmark(
          duplicateWindow,
          duplicateId,
          10,
          message(duplicateId)
        )
      )
    );
    expect(
      duplicateOutcomes.filter((outcome) => outcome === "enqueued")
    ).toHaveLength(1);
    expect(
      duplicateOutcomes.filter((outcome) => outcome === "duplicate")
    ).toHaveLength(4);
    expect(await processor.getXBookmarkUsage(duplicateWindow)).toEqual({
      count: 1,
    });
  });

  it("fails closed when persisted usage is malformed", async () => {
    const orgId = OrgId.make(`x-usage-corrupt-${crypto.randomUUID()}`);
    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(orgId)
    );
    const usageWindowId = "2026-08-01T00:00:00.000Z";
    const rejected = await runInDurableObject(
      processor,
      async (instance: LinkProcessorDO, state) => {
        await state.storage.put(`x-bookmark-usage:${usageWindowId}`, {
          count: "not-a-number",
        });
        const tweetId = XTweetId.make("corrupt-meter");

        try {
          await instance.enqueueXBookmark(usageWindowId, tweetId, 300, {
            url: `https://x.com/i/status/${tweetId}`,
            storeId: orgId,
            source: "x_bookmark",
            sourceMeta: null,
          });
          return false;
        } catch {
          return true;
        }
      }
    );
    expect(rejected).toBe(true);
  });

  it("does not recreate usage state when retirement races Queue admission", async () => {
    const orgId = OrgId.make(`x-usage-retire-${crypto.randomUUID()}`);
    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(orgId)
    );
    const queueStarted = deferredPromise();
    const releaseQueue = deferredPromise();
    await runInDurableObject(
      processor,
      async (instance: LinkProcessorDO, state) => {
        instance[X_BOOKMARK_QUEUE_TEST_OVERRIDE](
          XBookmarkQueue.of({
            send: () =>
              Effect.promise(() => {
                queueStarted.resolve();
                return releaseQueue.promise;
              }),
          })
        );
        const tweetId = XTweetId.make("retiring-tweet");
        const admission = instance.enqueueXBookmark(
          "2026-08-01T00:00:00.000Z",
          tweetId,
          300,
          {
            url: `https://x.com/i/status/${tweetId}`,
            storeId: orgId,
            source: "x_bookmark",
            sourceMeta: null,
          }
        );
        await queueStarted.promise;

        const retirement = instance.retire();
        const retiredBeforeRelease = await Promise.race([
          retirement.then(() => true),
          new Promise<false>((resolve) =>
            setTimeout(() => resolve(false), 100)
          ),
        ]);
        expect(retiredBeforeRelease).toBe(false);

        releaseQueue.resolve();
        await expect(admission).resolves.toBe("enqueued");
        await retirement;
        expect([...(await state.storage.list()).keys()]).toEqual([
          DURABLE_OBJECT_RETIRED_KEY,
        ]);
      }
    );
  });
});
