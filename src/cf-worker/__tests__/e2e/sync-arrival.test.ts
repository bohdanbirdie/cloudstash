import { abortAllDurableObjects, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import type { OrgId } from "@/cf-worker/db/branded";
import type { LinkQueueMessage } from "@/cf-worker/link-processor/types";
import { handleQueueBatch } from "@/cf-worker/queue-handler";

import {
  backendEventlogMax,
  quiesceLinkProcessor,
  signupUser,
  waitForBackendHead,
} from "./helpers";

const ingestMessage = (storeId: string, url: string): LinkQueueMessage => ({
  url,
  storeId: storeId as OrgId,
  source: "api",
  sourceMeta: null,
});

const linkProcessor = (storeId: string) =>
  env.LIBRARY_DO.get(env.LIBRARY_DO.idFromName(storeId));

const makeBatch = (messages: LinkQueueMessage[]) =>
  ({
    messages: messages.map((body, i) => ({
      body,
      id: `arrival-msg-${i}`,
      timestamp: new Date(),
      attempts: 1,
      ack() {},
      retry() {},
    })),
    queue: "cloudstash-link-queue",
  }) as unknown as MessageBatch<LinkQueueMessage>;

describe("sync arrival — events reach the SyncBackendDO eventlog", () => {
  it("a single ingest's event arrives on the sync backend", async () => {
    const user = await signupUser("arrival-single@test.com", "Arrival Single");
    const lp = linkProcessor(user.orgId);

    const result = await lp.ingestAndProcess(
      ingestMessage(user.orgId, "https://example.com/arrival-single")
    );
    expect(result.status).toBe("ingested");

    const head = await waitForBackendHead(user.orgId, 1);
    expect(head).toBeGreaterThanOrEqual(1);
  });

  it("concurrent ingests all arrive on the sync backend", async () => {
    const user = await signupUser(
      "arrival-concurrent@test.com",
      "Arrival Concurrent"
    );
    const lp = linkProcessor(user.orgId);

    const results = await Promise.all(
      [1, 2, 3].map((n) =>
        lp.ingestAndProcess(
          ingestMessage(user.orgId, `https://example.com/arrival-conc-${n}`)
        )
      )
    );
    for (const result of results) {
      expect(result.status).toBe("ingested");
    }

    const head = await waitForBackendHead(user.orgId, 3);
    expect(head).toBeGreaterThanOrEqual(3);
  });

  it("queue-batch ingests arrive on the sync backend", async () => {
    const user = await signupUser("arrival-queue@test.com", "Arrival Queue");

    await handleQueueBatch(
      makeBatch([
        ingestMessage(user.orgId, "https://example.com/arrival-queue-1"),
        ingestMessage(user.orgId, "https://example.com/arrival-queue-2"),
      ]),
      env
    );

    const head = await waitForBackendHead(user.orgId, 2);
    expect(head).toBeGreaterThanOrEqual(2);
  });

  it("events survive eviction and a cold-booted DO still syncs new ingests", async () => {
    const user = await signupUser(
      "arrival-eviction@test.com",
      "Arrival Eviction"
    );

    const first = await linkProcessor(user.orgId).ingestAndProcess(
      ingestMessage(user.orgId, "https://example.com/arrival-evict-a")
    );
    expect(first.status).toBe("ingested");
    const headBefore = await waitForBackendHead(user.orgId, 1);

    await quiesceLinkProcessor(linkProcessor(user.orgId));
    await abortAllDurableObjects();

    const survivedHead = (await backendEventlogMax(user.orgId)) ?? 0;
    expect(survivedHead).toBeGreaterThanOrEqual(headBefore);

    const second = await linkProcessor(user.orgId).ingestAndProcess(
      ingestMessage(user.orgId, "https://example.com/arrival-evict-b")
    );
    expect(second.status).toBe("ingested");

    const headAfter = await waitForBackendHead(user.orgId, survivedHead + 1);
    expect(headAfter).toBeGreaterThan(headBefore);
  });
});
