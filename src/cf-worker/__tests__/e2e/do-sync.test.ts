import { env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

import type { OrgId } from "@/cf-worker/db/branded";
import type { LinkQueueMessage } from "@/cf-worker/link-processor/types";
import { handleQueueBatch } from "@/cf-worker/queue-handler";

import { signupUser } from "./helpers";
import type { UserInfo } from "./helpers";

function getLinkProcessorStub(orgId: string) {
  const id = env.LINK_PROCESSOR_DO.idFromName(orgId);
  return env.LINK_PROCESSOR_DO.get(id);
}

function makeQueueMessage(
  url: string,
  storeId: string,
  opts?: { source?: string; sourceMeta?: string | null }
): LinkQueueMessage {
  return {
    url,
    storeId: storeId as OrgId,
    source: opts?.source ?? "api",
    sourceMeta: opts?.sourceMeta ?? null,
  };
}

function createMockBatch(
  messages: Array<{ body: LinkQueueMessage; id?: string }>
) {
  const mockMessages = messages.map((m, i) => {
    let acked = false;
    let retried = false;
    return {
      body: m.body,
      id: m.id ?? `msg-${i}`,
      timestamp: new Date(),
      attempts: 1,
      ack() {
        acked = true;
      },
      retry() {
        retried = true;
      },
      get _acked() {
        return acked;
      },
      get _retried() {
        return retried;
      },
    };
  });

  const batch = {
    messages: mockMessages,
    queue: "cloudstash-link-queue",
  } as unknown as MessageBatch<LinkQueueMessage>;

  return { batch, mockMessages };
}

describe("DO-to-DO Sync E2E", () => {
  let user: UserInfo;

  beforeAll(async () => {
    user = await signupUser("do-sync-user@test.com", "DO Sync User");
  });

  describe("cold boot sync", () => {
    it("ingests a link on a fresh LinkProcessorDO", async () => {
      const stub = getLinkProcessorStub(user.orgId);
      const msg = makeQueueMessage("https://example.com/cold-boot", user.orgId);

      const result = await stub.ingestAndProcess(msg);

      expect(result.status).toBe("ingested");
      expect(result.linkId).toBeDefined();
    });
  });

  describe("warm DO sync", () => {
    it("ingests a second link on an already-initialized DO", async () => {
      const stub = getLinkProcessorStub(user.orgId);
      const msg = makeQueueMessage("https://example.com/warm-do", user.orgId);

      const result = await stub.ingestAndProcess(msg);

      expect(result.status).toBe("ingested");
      expect(result.linkId).toBeDefined();
    });
  });

  describe("duplicate detection", () => {
    it("detects duplicate URLs via livestore state", async () => {
      const stub = getLinkProcessorStub(user.orgId);
      const url = "https://example.com/duplicate-test";
      const msg = makeQueueMessage(url, user.orgId);

      const first = await stub.ingestAndProcess(msg);
      expect(first.status).toBe("ingested");

      const second = await stub.ingestAndProcess(msg);
      expect(second.status).toBe("duplicate");
      expect(second.linkId).toBe(first.linkId);
    });
  });

  describe("concurrent ingests", () => {
    it("ingests multiple links simultaneously", async () => {
      const stub = getLinkProcessorStub(user.orgId);
      const urls = [
        "https://example.com/concurrent-1",
        "https://example.com/concurrent-2",
        "https://example.com/concurrent-3",
      ];

      const results = await Promise.all(
        urls.map((url) =>
          stub.ingestAndProcess(makeQueueMessage(url, user.orgId))
        )
      );

      for (const result of results) {
        expect(result.status).toBe("ingested");
        expect(result.linkId).toBeDefined();
      }

      const linkIds = results.map((r) => r.linkId);
      const uniqueIds = new Set(linkIds);
      expect(uniqueIds.size).toBe(urls.length);
    });
  });

  describe("invalid URL handling", () => {
    it("rejects invalid URLs", async () => {
      const stub = getLinkProcessorStub(user.orgId);
      const msg = makeQueueMessage("not-a-url", user.orgId);

      const result = await stub.ingestAndProcess(msg);

      expect(result.status).toBe("invalid_url");
    });
  });

  describe("cross-org isolation", () => {
    let otherUser: UserInfo;

    beforeAll(async () => {
      otherUser = await signupUser(
        "do-sync-other@test.com",
        "DO Sync Other User"
      );
    });

    it("different orgs have independent stores", async () => {
      const url = "https://example.com/cross-org-test";

      const stubA = getLinkProcessorStub(user.orgId);
      const stubB = getLinkProcessorStub(otherUser.orgId);

      const resultA = await stubA.ingestAndProcess(
        makeQueueMessage(url, user.orgId)
      );
      const resultB = await stubB.ingestAndProcess(
        makeQueueMessage(url, otherUser.orgId)
      );

      expect(resultA.status).toBe("ingested");
      expect(resultB.status).toBe("ingested");
      expect(resultA.linkId).not.toBe(resultB.linkId);
    });
  });

  describe("fetch trigger path (SyncBackendDO → LinkProcessorDO)", () => {
    it("initializes store and subscription via fetch", async () => {
      const triggerUser = await signupUser(
        "do-sync-trigger@test.com",
        "Trigger User"
      );
      const stub = getLinkProcessorStub(triggerUser.orgId);

      const res = await stub.fetch(
        `https://link-processor/?storeId=${triggerUser.orgId}`
      );

      expect(res.status).toBe(200);
      expect(await res.text()).toBe("OK");

      const ingestResult = await stub.ingestAndProcess(
        makeQueueMessage("https://example.com/after-trigger", triggerUser.orgId)
      );
      expect(ingestResult.status).toBe("ingested");
    });

    it("returns 400 without storeId", async () => {
      const stub = getLinkProcessorStub(user.orgId);

      const res = await stub.fetch("https://link-processor/");

      expect(res.status).toBe(400);
      expect(await res.text()).toBe("Missing storeId");
    });
  });

  describe("queue batch handler (real DOs)", () => {
    it("processes a single-message batch through the real queue handler", async () => {
      const queueUser = await signupUser(
        "do-sync-queue@test.com",
        "Queue User"
      );
      const { batch, mockMessages } = createMockBatch([
        {
          body: makeQueueMessage(
            "https://example.com/queue-single",
            queueUser.orgId
          ),
        },
      ]);

      await handleQueueBatch(batch, env);

      expect(mockMessages[0]._acked).toBe(true);
      expect(mockMessages[0]._retried).toBe(false);
    });

    it("processes a multi-message batch", async () => {
      const batchUser = await signupUser(
        "do-sync-batch@test.com",
        "Batch User"
      );
      const { batch, mockMessages } = createMockBatch([
        {
          body: makeQueueMessage(
            "https://example.com/batch-1",
            batchUser.orgId
          ),
        },
        {
          body: makeQueueMessage(
            "https://example.com/batch-2",
            batchUser.orgId
          ),
        },
        {
          body: makeQueueMessage(
            "https://example.com/batch-3",
            batchUser.orgId
          ),
        },
      ]);

      await handleQueueBatch(batch, env);

      for (const msg of mockMessages) {
        expect(msg._acked).toBe(true);
        expect(msg._retried).toBe(false);
      }
    });

    it("handles mixed-org batches routing to separate DOs", async () => {
      const orgA = await signupUser("do-sync-mix-a@test.com", "Mix User A");
      const orgB = await signupUser("do-sync-mix-b@test.com", "Mix User B");

      const url = "https://example.com/mixed-org-batch";
      const { batch, mockMessages } = createMockBatch([
        { body: makeQueueMessage(url, orgA.orgId) },
        { body: makeQueueMessage(url, orgB.orgId) },
      ]);

      await handleQueueBatch(batch, env);

      for (const msg of mockMessages) {
        expect(msg._acked).toBe(true);
      }

      const stubA = getLinkProcessorStub(orgA.orgId);
      const dupA = await stubA.ingestAndProcess(
        makeQueueMessage(url, orgA.orgId)
      );
      expect(dupA.status).toBe("duplicate");

      const stubB = getLinkProcessorStub(orgB.orgId);
      const dupB = await stubB.ingestAndProcess(
        makeQueueMessage(url, orgB.orgId)
      );
      expect(dupB.status).toBe("duplicate");
    });
  });

  describe("sequential ingestion after queue batch", () => {
    it("DO accepts direct ingestAndProcess after being initialized via queue batch", async () => {
      const seqUser = await signupUser(
        "do-sync-seq@test.com",
        "Sequential User"
      );

      const { batch } = createMockBatch([
        {
          body: makeQueueMessage(
            "https://example.com/seq-queue",
            seqUser.orgId
          ),
        },
      ]);
      await handleQueueBatch(batch, env);

      const stub = getLinkProcessorStub(seqUser.orgId);
      const direct = await stub.ingestAndProcess(
        makeQueueMessage("https://example.com/seq-direct", seqUser.orgId)
      );
      expect(direct.status).toBe("ingested");

      const dup = await stub.ingestAndProcess(
        makeQueueMessage("https://example.com/seq-queue", seqUser.orgId)
      );
      expect(dup.status).toBe("duplicate");
    });
  });
});
