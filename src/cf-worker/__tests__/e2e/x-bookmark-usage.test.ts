import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { OrgId } from "../../db/branded";

describe("X bookmark monthly usage", () => {
  it("admits idempotently and enforces the workspace limit", async () => {
    const orgId = OrgId.make(`x-usage-${crypto.randomUUID()}`);
    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(orgId)
    );
    const usageWindowId = "2026-08-01T00:00:00.000Z";
    const message = (tweetId: string) => ({
      url: `https://x.com/i/status/${tweetId}`,
      storeId: orgId,
      source: "x_bookmark",
      sourceMeta: null,
    });

    expect(
      await processor.enqueueXBookmark(
        usageWindowId,
        "tweet-1",
        2,
        message("tweet-1")
      )
    ).toBe("enqueued");
    expect(
      await processor.enqueueXBookmark(
        usageWindowId,
        "tweet-1",
        2,
        message("tweet-1")
      )
    ).toBe("duplicate");
    expect(
      await processor.enqueueXBookmark(
        usageWindowId,
        "tweet-2",
        2,
        message("tweet-2")
      )
    ).toBe("enqueued");
    expect(
      await processor.enqueueXBookmark(
        usageWindowId,
        "tweet-3",
        2,
        message("tweet-3")
      )
    ).toBe("limit_reached");

    expect(await processor.getXBookmarkUsage(usageWindowId)).toEqual({
      count: 2,
    });
  });
});
