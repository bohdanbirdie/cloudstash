import { Effect, Layer, LogLevel, Logger } from "effect";
import { describe, expect, it } from "vitest";

import {
  cancelStaleLinks,
  detectStuckLinks,
  ingestLink,
  notifyResult,
} from "../../link-processor/do-programs";
import {
  LinkRepository,
  SourceNotifier,
  type Link,
  type Status,
  type StoreEvent,
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
  const reactions: { source: string | null; emoji: string }[] = [];
  const replies: { source: string | null; text: string }[] = [];
  const layer = Layer.succeed(SourceNotifier, {
    react: (source, _sourceMeta, emoji) =>
      Effect.sync(() => {
        reactions.push({ source, emoji });
      }),
    reply: (source, _sourceMeta, text) =>
      Effect.sync(() => {
        replies.push({ source, text });
      }),
  });
  return { layer, reactions, replies };
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
    expect(notifier.reactions).toEqual([{ source: "telegram", emoji: "👌" }]);
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

describe("notifyResult", () => {
  it("reacts with 👍 and commits notified event on completed", async () => {
    const repo = createTestRepo();
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repo.layer, notifier.layer);

    await Effect.runPromise(
      notifyResult({
        linkId: "link-1",
        processingStatus: "completed",
        source: "telegram",
        sourceMeta: null,
      }).pipe(Effect.provide(testLayer), silentLogger)
    );

    expect(notifier.reactions).toEqual([{ source: "telegram", emoji: "👍" }]);
    expect(notifier.replies).toHaveLength(0);
    expect(repo.committed).toHaveLength(1);
    expect(repo.committed[0]).toMatchObject({
      name: "v1.LinkSourceNotified",
      args: expect.objectContaining({ linkId: "link-1" }),
    });
  });

  it("reacts with 👎, replies, and commits on failed", async () => {
    const repo = createTestRepo();
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repo.layer, notifier.layer);

    await Effect.runPromise(
      notifyResult({
        linkId: "link-1",
        processingStatus: "failed",
        source: "telegram",
        sourceMeta: null,
      }).pipe(Effect.provide(testLayer), silentLogger)
    );

    expect(notifier.reactions).toEqual([{ source: "telegram", emoji: "👎" }]);
    expect(notifier.replies).toEqual([
      { source: "telegram", text: "Failed to process link." },
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
