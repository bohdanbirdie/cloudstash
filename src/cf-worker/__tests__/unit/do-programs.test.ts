import { Effect, Layer, LogLevel, Logger } from "effect";
import { describe, expect, it } from "vitest";

import {
  cancelStaleLinks,
  detectStuckLinks,
  ingestLink,
  notifyResult,
} from "../../link-processor/do-programs";
import { LinkRepository, SourceNotifier } from "../../link-processor/services";
import type {
  Link,
  NotifyPayload,
  Status,
  StoreEvent,
} from "../../link-processor/services";

function createTestRepo(links: Link[] = [], statuses: Status[] = []) {
  const committed: StoreEvent[] = [];
  const layer = Layer.succeed(LinkRepository, {
    findByUrl: (url) =>
      Effect.succeed(links.find((l) => l.url === url) ?? null),
    queryActiveLinks: () => Effect.succeed([...links]),
    queryStatuses: () => Effect.succeed([...statuses]),
    commitEvent: (event) =>
      Effect.sync(() => {
        committed.push(event);
      }),
  });
  return { layer, committed };
}

function createTestNotifier() {
  const drafts: { source: string | null; text: string }[] = [];
  const finalized: { source: string | null; payload: NotifyPayload }[] = [];
  const replies: { source: string | null; text: string }[] = [];
  const layer = Layer.succeed(SourceNotifier, {
    streamProgress: (ctx, text) =>
      Effect.sync(() => {
        drafts.push({ source: ctx.source, text });
      }),
    finalizeProgress: (ctx, payload) =>
      Effect.sync(() => {
        finalized.push({ source: ctx.source, payload });
      }),
    reply: (ctx, text) =>
      Effect.sync(() => {
        replies.push({ source: ctx.source, text });
      }),
  });
  return { layer, drafts, finalized, replies };
}

const makeLink = (overrides: Partial<Link> = {}): Link =>
  ({
    id: "link-1",
    url: "https://example.com",
    domain: "example.com",
    status: "unread",
    source: null,
    sourceMeta: null,
    createdAt: new Date("2026-01-01"),
    completedAt: null,
    deletedAt: null,
    ...overrides,
  }) as Link;

const makeStatus = (overrides: Partial<Status> = {}): Status =>
  ({
    linkId: "link-1",
    status: "pending",
    error: null,
    notified: 0,
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  }) as Status;

const silentLogger = Logger.withMinimumLogLevel(LogLevel.None);

describe("ingestLink", () => {
  it("ingests a new URL and commits linkCreatedV2", async () => {
    const repo = createTestRepo();
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repo.layer, notifier.layer);

    const result = await Effect.runPromise(
      ingestLink({
        url: "https://example.com",
        storeId: "org-1",
        source: "telegram",
        sourceMeta: null,
      }).pipe(Effect.provide(testLayer), silentLogger)
    );

    expect(result.status).toBe("ingested");
    expect(result.linkId).toBeDefined();
    expect(repo.committed).toHaveLength(1);
    expect(repo.committed[0]).toMatchObject({
      name: "v2.LinkCreated",
      args: expect.objectContaining({
        url: "https://example.com",
        domain: "example.com",
        source: "telegram",
      }),
    });
  });

  it("returns duplicate and notifies when URL already exists", async () => {
    const existing = makeLink({ id: "existing-1", url: "https://example.com" });
    const repo = createTestRepo([existing]);
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repo.layer, notifier.layer);

    const result = await Effect.runPromise(
      ingestLink({
        url: "https://example.com",
        storeId: "org-1",
        source: "telegram",
        sourceMeta: null,
      }).pipe(Effect.provide(testLayer), silentLogger)
    );

    expect(result.status).toBe("duplicate");
    expect(result.linkId).toBe("existing-1");
    expect(repo.committed).toHaveLength(0);
    expect(notifier.replies).toEqual([
      { source: "telegram", text: "Link already saved." },
    ]);
  });

  it("returns invalid_url for bad URLs", async () => {
    const repo = createTestRepo();
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repo.layer, notifier.layer);

    const result = await Effect.runPromise(
      ingestLink({
        url: "not-a-url",
        storeId: "org-1",
        source: "telegram",
        sourceMeta: null,
      }).pipe(Effect.provide(testLayer), silentLogger)
    );

    expect(result.status).toBe("invalid_url");
    expect(repo.committed).toHaveLength(0);
  });

  it("strips www from domain", async () => {
    const repo = createTestRepo();
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repo.layer, notifier.layer);

    await Effect.runPromise(
      ingestLink({
        url: "https://www.example.com/page",
        storeId: "org-1",
        source: "app",
        sourceMeta: null,
      }).pipe(Effect.provide(testLayer), silentLogger)
    );

    expect(repo.committed[0]).toMatchObject({
      args: expect.objectContaining({ domain: "example.com" }),
    });
  });
});

describe("cancelStaleLinks", () => {
  const FIVE_MIN = 5 * 60 * 1000;

  it("cancels a stale link with no status", async () => {
    const staleLink = makeLink({
      createdAt: new Date(Date.now() - FIVE_MIN - 1000),
    });
    const repo = createTestRepo([staleLink]);
    const now = Date.now();

    const cancelled = await Effect.runPromise(
      cancelStaleLinks(new Set(), now).pipe(
        Effect.provide(repo.layer),
        silentLogger
      )
    );

    expect(cancelled).toBe(1);
    expect(repo.committed[0]).toMatchObject({
      name: "v1.LinkProcessingCancelled",
      args: expect.objectContaining({ linkId: "link-1" }),
    });
  });

  it("skips links currently being processed", async () => {
    const staleLink = makeLink({
      createdAt: new Date(Date.now() - FIVE_MIN - 1000),
    });
    const repo = createTestRepo([staleLink]);

    const cancelled = await Effect.runPromise(
      cancelStaleLinks(new Set(["link-1"]), Date.now()).pipe(
        Effect.provide(repo.layer),
        silentLogger
      )
    );

    expect(cancelled).toBe(0);
    expect(repo.committed).toHaveLength(0);
  });

  it("skips completed and cancelled links", async () => {
    const link = makeLink({
      createdAt: new Date(Date.now() - FIVE_MIN - 1000),
    });
    const status = makeStatus({ linkId: "link-1", status: "completed" });
    const repo = createTestRepo([link], [status]);

    const cancelled = await Effect.runPromise(
      cancelStaleLinks(new Set(), Date.now()).pipe(
        Effect.provide(repo.layer),
        silentLogger
      )
    );

    expect(cancelled).toBe(0);
  });

  it("skips failed links", async () => {
    const link = makeLink({
      createdAt: new Date(Date.now() - FIVE_MIN - 1000),
    });
    const status = makeStatus({ linkId: "link-1", status: "failed" });
    const repo = createTestRepo([link], [status]);

    const cancelled = await Effect.runPromise(
      cancelStaleLinks(new Set(), Date.now()).pipe(
        Effect.provide(repo.layer),
        silentLogger
      )
    );

    expect(cancelled).toBe(0);
    expect(repo.committed).toHaveLength(0);
  });

  it("does not cancel fresh links", async () => {
    const freshLink = makeLink({ createdAt: new Date() });
    const repo = createTestRepo([freshLink]);

    const cancelled = await Effect.runPromise(
      cancelStaleLinks(new Set(), Date.now()).pipe(
        Effect.provide(repo.layer),
        silentLogger
      )
    );

    expect(cancelled).toBe(0);
    expect(repo.committed).toHaveLength(0);
  });
});

describe("notification dedup", () => {
  it("filters out already-notified linkIds", () => {
    const notifiedLinkIds = new Set<string>();
    const results = [
      {
        linkId: "link-1",
        processingStatus: "completed" as const,
        source: "telegram",
        sourceMeta: null,
      },
      {
        linkId: "link-2",
        processingStatus: "failed" as const,
        source: "telegram",
        sourceMeta: null,
      },
    ];

    const newResults = results.filter((r) => !notifiedLinkIds.has(r.linkId));
    for (const r of newResults) notifiedLinkIds.add(r.linkId);

    expect(newResults).toHaveLength(2);
    expect(notifiedLinkIds.size).toBe(2);

    const secondRun = results.filter((r) => !notifiedLinkIds.has(r.linkId));
    expect(secondRun).toHaveLength(0);
  });

  it("allows new linkIds while blocking seen ones", () => {
    const notifiedLinkIds = new Set<string>(["link-1"]);
    const results = [
      {
        linkId: "link-1",
        processingStatus: "completed" as const,
        source: "telegram",
        sourceMeta: null,
      },
      {
        linkId: "link-3",
        processingStatus: "completed" as const,
        source: "telegram",
        sourceMeta: null,
      },
    ];

    const newResults = results.filter((r) => !notifiedLinkIds.has(r.linkId));
    for (const r of newResults) notifiedLinkIds.add(r.linkId);

    expect(newResults).toHaveLength(1);
    expect(newResults[0].linkId).toBe("link-3");
  });
});

describe("notifyResult", () => {
  it("passes completed payload and commits notified event", async () => {
    const repo = createTestRepo();
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repo.layer, notifier.layer);

    await Effect.runPromise(
      notifyResult({
        linkId: "link-1",
        processingStatus: "completed",
        source: "telegram",
        sourceMeta: null,
        summary: "A summary",
        suggestedTags: ["tag1"],
      }).pipe(Effect.provide(testLayer), silentLogger)
    );

    expect(notifier.finalized).toEqual([
      {
        source: "telegram",
        payload: {
          processingStatus: "completed",
          summary: "A summary",
          suggestedTags: ["tag1"],
        },
      },
    ]);
    expect(repo.committed).toHaveLength(1);
    expect(repo.committed[0]).toMatchObject({
      name: "v1.LinkSourceNotified",
      args: expect.objectContaining({ linkId: "link-1" }),
    });
  });

  it("passes failed payload and commits notified event", async () => {
    const repo = createTestRepo();
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repo.layer, notifier.layer);

    await Effect.runPromise(
      notifyResult({
        linkId: "link-1",
        processingStatus: "failed",
        source: "telegram",
        sourceMeta: null,
        summary: null,
        suggestedTags: [],
      }).pipe(Effect.provide(testLayer), silentLogger)
    );

    expect(notifier.finalized).toEqual([
      {
        source: "telegram",
        payload: {
          processingStatus: "failed",
          summary: null,
          suggestedTags: [],
        },
      },
    ]);
    expect(repo.committed).toHaveLength(1);
    expect(repo.committed[0]).toMatchObject({
      name: "v1.LinkSourceNotified",
    });
  });
});

describe("detectStuckLinks", () => {
  const FIVE_MIN = 5 * 60 * 1000;
  const now = Date.now();

  it("detects a stuck pending link", () => {
    const link = makeLink();
    const status = makeStatus({
      updatedAt: new Date(now - FIVE_MIN - 1000),
    });

    const stuck = detectStuckLinks([link], [status], new Set(), now);

    expect(stuck).toHaveLength(1);
    expect(stuck[0].linkId).toBe("link-1");
    expect(stuck[0].stuckMs).toBeGreaterThan(FIVE_MIN);
  });

  it("skips links currently processing", () => {
    const link = makeLink();
    const status = makeStatus({
      updatedAt: new Date(now - FIVE_MIN - 1000),
    });

    const stuck = detectStuckLinks([link], [status], new Set(["link-1"]), now);

    expect(stuck).toHaveLength(0);
  });

  it("skips fresh pending links", () => {
    const link = makeLink();
    const status = makeStatus({ updatedAt: new Date(now - 1000) });

    const stuck = detectStuckLinks([link], [status], new Set(), now);

    expect(stuck).toHaveLength(0);
  });

  it("skips links without a pending status", () => {
    const link = makeLink();

    const stuck = detectStuckLinks([link], [], new Set(), now);

    expect(stuck).toHaveLength(0);
  });
});
