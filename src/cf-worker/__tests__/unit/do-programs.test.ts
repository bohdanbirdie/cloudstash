// @vitest-environment jsdom
import { it, describe, expect, beforeEach, afterEach } from "@effect/vitest";
import { Effect, Layer } from "effect";

import {
  makeTestStore,
  silentLogger,
} from "../../../livestore/__tests__/test-helpers";
import type { TestStore } from "../../../livestore/__tests__/test-helpers";
import { events, tables } from "../../../livestore/schema";
import { LinkId, OrgId } from "../../db/branded";
import {
  cancelStaleLinks,
  detectStuckLinks,
  ingestLink,
  notifyResult,
} from "../../link-processor/do-programs";
import {
  buildTelegramProgress,
  evictOldestFromSet,
  parseMeta,
  renderProgressDraft,
} from "../../link-processor/progress-draft";
import { SourceNotifier } from "../../link-processor/services";
import type {
  Link,
  NotifyPayload,
  Status,
} from "../../link-processor/services";
import { LinkRepositoryLive } from "../../link-processor/services/link-repository.live";

let store: TestStore;

beforeEach(async () => {
  store = await makeTestStore();
});

afterEach(async () => {
  await store.shutdownPromise?.();
});

const repoLayer = () => LinkRepositoryLive(store);

/**
 * Seed a link directly via linkCreatedV2 event. Returns the link id.
 * createdAt is controlled by caller (used by cancelStaleLinks tests).
 */
const seedLink = (opts: Partial<Link> = {}) => {
  const id = opts.id ?? "link-1";
  const url = opts.url ?? "https://example.com";
  const domain = opts.domain ?? "example.com";
  const createdAt = opts.createdAt ?? new Date("2026-01-01T00:00:00Z");
  store.commit(
    events.linkCreatedV2({
      id,
      url,
      domain,
      createdAt,
      source: opts.source ?? "",
      sourceMeta: opts.sourceMeta ?? null,
    })
  );
  return id;
};

/**
 * Seed a processing status row for a link using linkProcessingStarted plus a
 * follow-up event for non-pending statuses. `updatedAt` controls the final
 * updatedAt.
 */
const seedStatus = (
  linkId: string,
  status: Status["status"],
  updatedAt: Date
) => {
  // Insert via started (pending)
  store.commit(events.linkProcessingStarted({ linkId, updatedAt }));
  if (status === "pending") return;
  if (status === "completed") {
    store.commit(events.linkProcessingCompleted({ linkId, updatedAt }));
  } else if (status === "failed") {
    store.commit(
      events.linkProcessingFailed({
        linkId,
        error: "err",
        updatedAt,
      })
    );
  } else if (status === "cancelled") {
    store.commit(events.linkProcessingCancelled({ linkId, updatedAt }));
  } else if (status === "reprocess-requested") {
    store.commit(
      events.linkReprocessRequested({ linkId, requestedAt: updatedAt })
    );
  }
};

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

const makeLink = (overrides: Partial<Link> = {}): Link => ({
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
});

const makeStatus = (overrides: Partial<Status> = {}): Status => ({
  linkId: "link-1",
  status: "pending",
  error: null,
  notified: 0,
  updatedAt: new Date("2026-01-01"),
  ...overrides,
});

describe("ingestLink", () => {
  it.effect("ingests a new URL and commits linkCreatedV2", () => {
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repoLayer(), notifier.layer);

    return ingestLink({
      url: "https://example.com",
      storeId: OrgId.make("org-1"),
      source: "telegram",
      sourceMeta: null,
    }).pipe(
      Effect.provide(testLayer),
      silentLogger,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result.status).toBe("ingested");
          expect(result.linkId).toBeDefined();
          const rows = store.query(
            tables.links.where({ url: "https://example.com" })
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].domain).toBe("example.com");
          expect(rows[0].source).toBe("telegram");
        })
      )
    );
  });

  it.effect("returns duplicate and notifies when URL already exists", () => {
    seedLink({ id: "existing-1", url: "https://example.com" });
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repoLayer(), notifier.layer);

    return ingestLink({
      url: "https://example.com",
      storeId: OrgId.make("org-1"),
      source: "telegram",
      sourceMeta: null,
    }).pipe(
      Effect.provide(testLayer),
      silentLogger,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result.status).toBe("duplicate");
          expect(result.linkId).toBe("existing-1");
          // Still only one row (duplicate URL never inserted).
          const rows = store.query(
            tables.links.where({ url: "https://example.com" })
          );
          expect(rows).toHaveLength(1);
          expect(notifier.replies).toEqual([
            { source: "telegram", text: "Link already saved." },
          ]);
        })
      )
    );
  });

  it.effect("returns invalid_url for bad URLs", () => {
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repoLayer(), notifier.layer);

    return ingestLink({
      url: "not-a-url",
      storeId: OrgId.make("org-1"),
      source: "telegram",
      sourceMeta: null,
    }).pipe(
      Effect.provide(testLayer),
      silentLogger,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result.status).toBe("invalid_url");
          expect(store.query(tables.links.where({}))).toHaveLength(0);
        })
      )
    );
  });

  it.effect("strips www from domain", () => {
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repoLayer(), notifier.layer);

    return ingestLink({
      url: "https://www.example.com/page",
      storeId: OrgId.make("org-1"),
      source: "app",
      sourceMeta: null,
    }).pipe(
      Effect.provide(testLayer),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
          const rows = store.query(
            tables.links.where({ url: "https://www.example.com/page" })
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].domain).toBe("example.com");
        })
      )
    );
  });
});

describe("cancelStaleLinks", () => {
  const FIVE_MIN = 5 * 60 * 1000;

  it.effect("cancels a stale link with no status", () => {
    const now = Date.now();
    seedLink({ createdAt: new Date(now - FIVE_MIN - 1000) });

    return cancelStaleLinks(new Set(), now).pipe(
      Effect.provide(repoLayer()),
      silentLogger,
      Effect.tap((cancelledLinks) =>
        Effect.sync(() => {
          expect(cancelledLinks).toHaveLength(1);
          expect(cancelledLinks[0]).toMatchObject({ linkId: "link-1" });
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: "link-1" })
          )[0];
          expect(status.status).toBe("cancelled");
        })
      )
    );
  });

  it.effect("skips links currently being processed", () => {
    seedLink({ createdAt: new Date(Date.now() - FIVE_MIN - 1000) });

    return cancelStaleLinks(new Set(["link-1"]), Date.now()).pipe(
      Effect.provide(repoLayer()),
      silentLogger,
      Effect.tap((cancelledLinks) =>
        Effect.sync(() => {
          expect(cancelledLinks).toHaveLength(0);
          const statusRows = store.query(
            tables.linkProcessingStatus.where({ linkId: "link-1" })
          );
          expect(statusRows).toHaveLength(0);
        })
      )
    );
  });

  it.effect("skips completed links", () => {
    seedLink({ createdAt: new Date(Date.now() - FIVE_MIN - 1000) });
    seedStatus("link-1", "completed", new Date("2026-01-01"));

    return cancelStaleLinks(new Set(), Date.now()).pipe(
      Effect.provide(repoLayer()),
      silentLogger,
      Effect.tap((cancelledLinks) =>
        Effect.sync(() => {
          expect(cancelledLinks).toHaveLength(0);
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: "link-1" })
          )[0];
          expect(status.status).toBe("completed");
        })
      )
    );
  });

  it.effect("skips cancelled links", () => {
    seedLink({ createdAt: new Date(Date.now() - FIVE_MIN - 1000) });
    seedStatus("link-1", "cancelled", new Date("2026-01-01"));

    return cancelStaleLinks(new Set(), Date.now()).pipe(
      Effect.provide(repoLayer()),
      silentLogger,
      Effect.tap((cancelledLinks) =>
        Effect.sync(() => {
          expect(cancelledLinks).toHaveLength(0);
        })
      )
    );
  });

  it.effect("skips failed links", () => {
    seedLink({ createdAt: new Date(Date.now() - FIVE_MIN - 1000) });
    seedStatus("link-1", "failed", new Date("2026-01-01"));

    return cancelStaleLinks(new Set(), Date.now()).pipe(
      Effect.provide(repoLayer()),
      silentLogger,
      Effect.tap((cancelledLinks) =>
        Effect.sync(() => {
          expect(cancelledLinks).toHaveLength(0);
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: "link-1" })
          )[0];
          expect(status.status).toBe("failed");
        })
      )
    );
  });

  it.effect("does not cancel link at exactly 5 minutes", () => {
    const now = Date.now();
    seedLink({ createdAt: new Date(now - FIVE_MIN) });

    return cancelStaleLinks(new Set(), now).pipe(
      Effect.provide(repoLayer()),
      silentLogger,
      Effect.tap((cancelledLinks) =>
        Effect.sync(() => {
          expect(cancelledLinks).toHaveLength(0);
        })
      )
    );
  });

  it.effect(
    "cancels stale link with pending status using status.updatedAt",
    () => {
      const now = Date.now();
      seedLink({ createdAt: new Date(now) });
      seedStatus("link-1", "pending", new Date(now - FIVE_MIN - 1000));

      return cancelStaleLinks(new Set(), now).pipe(
        Effect.provide(repoLayer()),
        silentLogger,
        Effect.tap((cancelledLinks) =>
          Effect.sync(() => {
            expect(cancelledLinks).toHaveLength(1);
          })
        )
      );
    }
  );

  it.effect("returns source and sourceMeta in cancelled link info", () => {
    const sm = JSON.stringify({ chatId: 1, messageId: 10 });
    seedLink({
      createdAt: new Date(Date.now() - FIVE_MIN - 1000),
      source: "telegram",
      sourceMeta: sm,
    });

    return cancelStaleLinks(new Set(), Date.now()).pipe(
      Effect.provide(repoLayer()),
      silentLogger,
      Effect.tap((cancelledLinks) =>
        Effect.sync(() => {
          expect(cancelledLinks[0]).toMatchObject({
            source: "telegram",
            sourceMeta: sm,
          });
        })
      )
    );
  });

  it.effect("cancels multiple stale links", () => {
    seedLink({
      id: "link-1",
      url: "https://a.com",
      createdAt: new Date(Date.now() - FIVE_MIN - 1000),
    });
    seedLink({
      id: "link-2",
      url: "https://b.com",
      createdAt: new Date(Date.now() - FIVE_MIN - 2000),
    });

    return cancelStaleLinks(new Set(), Date.now()).pipe(
      Effect.provide(repoLayer()),
      silentLogger,
      Effect.tap((cancelledLinks) =>
        Effect.sync(() => {
          expect(cancelledLinks).toHaveLength(2);
          const s1 = store.query(
            tables.linkProcessingStatus.where({ linkId: "link-1" })
          )[0];
          const s2 = store.query(
            tables.linkProcessingStatus.where({ linkId: "link-2" })
          )[0];
          expect(s1.status).toBe("cancelled");
          expect(s2.status).toBe("cancelled");
        })
      )
    );
  });

  it.effect("does not cancel fresh links", () => {
    seedLink({ createdAt: new Date() });

    return cancelStaleLinks(new Set(), Date.now()).pipe(
      Effect.provide(repoLayer()),
      silentLogger,
      Effect.tap((cancelledLinks) =>
        Effect.sync(() => {
          expect(cancelledLinks).toHaveLength(0);
          const statusRows = store.query(
            tables.linkProcessingStatus.where({ linkId: "link-1" })
          );
          expect(statusRows).toHaveLength(0);
        })
      )
    );
  });
});

describe("notifyResult", () => {
  it.effect("passes completed payload and commits notified event", () => {
    // Seed a link + pending status so the notified flag can be updated.
    seedLink({ id: "link-1" });
    seedStatus("link-1", "pending", new Date("2026-01-01"));
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repoLayer(), notifier.layer);

    return notifyResult({
      linkId: LinkId.make("link-1"),
      processingStatus: "completed",
      source: "telegram",
      sourceMeta: null,
      summary: "A summary",
      suggestedTags: ["tag1"],
    }).pipe(
      Effect.provide(testLayer),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
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
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: "link-1" })
          )[0];
          expect(status.notified).toBe(1);
        })
      )
    );
  });

  it.effect("passes failed payload and commits notified event", () => {
    seedLink({ id: "link-1" });
    seedStatus("link-1", "pending", new Date("2026-01-01"));
    const notifier = createTestNotifier();
    const testLayer = Layer.mergeAll(repoLayer(), notifier.layer);

    return notifyResult({
      linkId: LinkId.make("link-1"),
      processingStatus: "failed",
      source: "telegram",
      sourceMeta: null,
      summary: null,
      suggestedTags: [],
    }).pipe(
      Effect.provide(testLayer),
      silentLogger,
      Effect.tap(() =>
        Effect.sync(() => {
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
          const status = store.query(
            tables.linkProcessingStatus.where({ linkId: "link-1" })
          )[0];
          expect(status.notified).toBe(1);
        })
      )
    );
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

  it("skips links with reprocess-requested status", () => {
    const link = makeLink();
    const status = makeStatus({
      status: "reprocess-requested",
      updatedAt: new Date(now - FIVE_MIN - 1000),
    });

    const stuck = detectStuckLinks([link], [status], new Set(), now);

    expect(stuck).toHaveLength(0);
  });

  it("does not detect link at exactly 5 minutes", () => {
    const link = makeLink();
    const status = makeStatus({ updatedAt: new Date(now - FIVE_MIN) });

    const stuck = detectStuckLinks([link], [status], new Set(), now);

    expect(stuck).toHaveLength(0);
  });
});

describe("renderProgressDraft", () => {
  it("renders single saving link", () => {
    const links = new Map([
      ["l1", { domain: "example.com", stage: "saving" as const }],
    ]);
    expect(renderProgressDraft(links)).toBe("Saving link: example.com");
  });

  it("renders single processing link", () => {
    const links = new Map([
      ["l1", { domain: "example.com", stage: "processing" as const }],
    ]);
    expect(renderProgressDraft(links)).toBe("Processing link: example.com");
  });

  it("renders processing link before saving link", () => {
    const links = new Map([
      ["l1", { domain: "a.com", stage: "processing" as const }],
      ["l2", { domain: "b.com", stage: "saving" as const }],
    ]);
    expect(renderProgressDraft(links)).toBe(
      "Processing link: a.com\nSaving link: b.com"
    );
  });

  it("renders all saving", () => {
    const links = new Map([
      ["l1", { domain: "a.com", stage: "saving" as const }],
      ["l2", { domain: "b.com", stage: "saving" as const }],
    ]);
    expect(renderProgressDraft(links)).toBe(
      "Saving link: a.com\nSaving link: b.com"
    );
  });

  it("renders all processing", () => {
    const links = new Map([
      ["l1", { domain: "a.com", stage: "processing" as const }],
      ["l2", { domain: "b.com", stage: "processing" as const }],
    ]);
    expect(renderProgressDraft(links)).toBe(
      "Processing link: a.com\nProcessing link: b.com"
    );
  });

  it("renders 5 links preserving insertion order", () => {
    const links = new Map([
      ["1", { domain: "a.com", stage: "processing" as const }],
      ["2", { domain: "b.com", stage: "processing" as const }],
      ["3", { domain: "c.com", stage: "saving" as const }],
      ["4", { domain: "d.com", stage: "saving" as const }],
      ["5", { domain: "e.com", stage: "saving" as const }],
    ]);
    expect(renderProgressDraft(links)).toBe(
      [
        "Processing link: a.com",
        "Processing link: b.com",
        "Saving link: c.com",
        "Saving link: d.com",
        "Saving link: e.com",
      ].join("\n")
    );
  });
});

describe("buildTelegramProgress — stage derivation", () => {
  const sm = (chatId: number, messageId: number) =>
    JSON.stringify({ chatId, messageId });

  const link = (
    id: string,
    domain: string,
    chatId: number,
    messageId: number,
    url = ""
  ) => ({
    id,
    source: "telegram" as string | null,
    sourceMeta: sm(chatId, messageId),
    domain,
    url: url || `https://${domain}`,
  });

  const status = (linkId: string, s: string) => ({
    linkId,
    status: s,
  });

  it("no links returns empty map", () => {
    expect(buildTelegramProgress([], [], 1).size).toBe(0);
  });

  it("link with no status row = saving", () => {
    const result = buildTelegramProgress(
      [link("l1", "example.com", 1, 10)],
      [],
      1
    );
    expect(result.get("l1")).toEqual({
      domain: "example.com",
      stage: "saving",
    });
  });

  it("link with pending status = processing", () => {
    const result = buildTelegramProgress(
      [link("l1", "example.com", 1, 10)],
      [status("l1", "pending")],
      1
    );
    expect(result.get("l1")).toEqual({
      domain: "example.com",
      stage: "processing",
    });
  });

  it("link with completed status excluded", () => {
    const result = buildTelegramProgress(
      [link("l1", "example.com", 1, 10)],
      [status("l1", "completed")],
      1
    );
    expect(result.size).toBe(0);
  });

  it("link with failed status excluded", () => {
    const result = buildTelegramProgress(
      [link("l1", "example.com", 1, 10)],
      [status("l1", "failed")],
      1
    );
    expect(result.size).toBe(0);
  });

  it("link with cancelled status excluded", () => {
    const result = buildTelegramProgress(
      [link("l1", "example.com", 1, 10)],
      [status("l1", "cancelled")],
      1
    );
    expect(result.size).toBe(0);
  });

  it("non-telegram links excluded", () => {
    const appLink = {
      id: "l1",
      source: "app",
      sourceMeta: null,
      domain: "example.com",
      url: "https://example.com",
    };
    const result = buildTelegramProgress([appLink], [], 1);
    expect(result.size).toBe(0);
  });

  it("links from different chatId excluded", () => {
    const result = buildTelegramProgress(
      [link("l1", "example.com", 2, 10)],
      [],
      1
    );
    expect(result.size).toBe(0);
  });

  it("falls back to url when domain is empty", () => {
    const l = link("l1", "", 1, 10, "https://example.com/article");
    const result = buildTelegramProgress([l], [], 1);
    expect(result.get("l1")?.domain).toBe("https://example.com/article");
  });
});

describe("buildTelegramProgress — multi-link states", () => {
  const sm = (chatId: number, messageId: number) =>
    JSON.stringify({ chatId, messageId });

  const link = (id: string, domain: string, chatId = 1, messageId = 10) => ({
    id,
    source: "telegram" as string | null,
    sourceMeta: sm(chatId, messageId),
    domain,
    url: `https://${domain}`,
  });

  const status = (linkId: string, s: string) => ({
    linkId,
    status: s,
  });

  it("two links both saving (no status rows)", () => {
    const result = buildTelegramProgress(
      [link("l1", "a.com"), link("l2", "b.com")],
      [],
      1
    );
    const draft = renderProgressDraft(result);
    expect(draft).toBe("Saving link: a.com\nSaving link: b.com");
  });

  it("two links both processing (pending status)", () => {
    const result = buildTelegramProgress(
      [link("l1", "a.com"), link("l2", "b.com")],
      [status("l1", "pending"), status("l2", "pending")],
      1
    );
    const draft = renderProgressDraft(result);
    expect(draft).toBe("Processing link: a.com\nProcessing link: b.com");
  });

  it("one processing one saving", () => {
    const result = buildTelegramProgress(
      [link("l1", "a.com"), link("l2", "b.com")],
      [status("l1", "pending")],
      1
    );
    const draft = renderProgressDraft(result);
    expect(draft).toBe("Processing link: a.com\nSaving link: b.com");
  });

  it("completed link excluded, remaining shown", () => {
    const result = buildTelegramProgress(
      [link("l1", "a.com"), link("l2", "b.com")],
      [status("l1", "completed"), status("l2", "pending")],
      1
    );
    const draft = renderProgressDraft(result);
    expect(draft).toBe("Processing link: b.com");
  });

  it("different chats are fully independent", () => {
    const links = [
      link("l1", "a.com", 1, 10),
      link("l2", "b.com", 2, 20),
      link("l3", "c.com", 1, 10),
    ];

    const chat1 = buildTelegramProgress(links, [], 1);
    const chat2 = buildTelegramProgress(links, [], 2);

    expect(renderProgressDraft(chat1)).toBe(
      "Saving link: a.com\nSaving link: c.com"
    );
    expect(renderProgressDraft(chat2)).toBe("Saving link: b.com");
  });

  it("5 links with mixed statuses", () => {
    const links = [
      link("l1", "a.com"),
      link("l2", "b.com"),
      link("l3", "c.com"),
      link("l4", "d.com"),
      link("l5", "e.com"),
    ];
    const statuses = [
      status("l1", "completed"),
      status("l2", "pending"),
      status("l3", "pending"),
    ];

    const result = buildTelegramProgress(links, statuses, 1);
    const draft = renderProgressDraft(result);
    expect(draft).toBe(
      [
        "Processing link: b.com",
        "Processing link: c.com",
        "Saving link: d.com",
        "Saving link: e.com",
      ].join("\n")
    );
  });

  it("all links completed returns empty map", () => {
    const links = [link("l1", "a.com"), link("l2", "b.com")];
    const statuses = [status("l1", "completed"), status("l2", "completed")];
    const result = buildTelegramProgress(links, statuses, 1);
    expect(result.size).toBe(0);
  });
});

describe("buildTelegramProgress — DO lifecycle scenarios", () => {
  const sm = (chatId: number, messageId: number) =>
    JSON.stringify({ chatId, messageId });

  const link = (id: string, domain: string, chatId = 1, messageId = 10) => ({
    id,
    source: "telegram" as string | null,
    sourceMeta: sm(chatId, messageId),
    domain,
    url: `https://${domain}`,
  });

  const status = (linkId: string, s: string) => ({
    linkId,
    status: s,
  });

  it("single link lifecycle: saving → processing → completed", () => {
    const links = [link("l1", "example.com")];

    // Just ingested, no status row
    let result = buildTelegramProgress(links, [], 1);
    expect(renderProgressDraft(result)).toBe("Saving link: example.com");

    // linkProcessingStarted committed
    result = buildTelegramProgress(links, [status("l1", "pending")], 1);
    expect(renderProgressDraft(result)).toBe("Processing link: example.com");

    // linkProcessingCompleted committed
    result = buildTelegramProgress(links, [status("l1", "completed")], 1);
    expect(result.size).toBe(0);
  });

  it("concurrent: A processing, B saving, A finishes first", () => {
    const links = [link("a", "a.com"), link("b", "b.com")];

    // Both ingested
    let result = buildTelegramProgress(links, [], 1);
    expect(renderProgressDraft(result)).toBe(
      "Saving link: a.com\nSaving link: b.com"
    );

    // A starts processing
    result = buildTelegramProgress(links, [status("a", "pending")], 1);
    expect(renderProgressDraft(result)).toBe(
      "Processing link: a.com\nSaving link: b.com"
    );

    // Both processing
    result = buildTelegramProgress(
      links,
      [status("a", "pending"), status("b", "pending")],
      1
    );
    expect(renderProgressDraft(result)).toBe(
      "Processing link: a.com\nProcessing link: b.com"
    );

    // A completes
    result = buildTelegramProgress(
      links,
      [status("a", "completed"), status("b", "pending")],
      1
    );
    expect(renderProgressDraft(result)).toBe("Processing link: b.com");

    // B completes
    result = buildTelegramProgress(
      links,
      [status("a", "completed"), status("b", "completed")],
      1
    );
    expect(result.size).toBe(0);
  });

  it("concurrent: B finishes before A", () => {
    const links = [link("a", "a.com"), link("b", "b.com")];

    const result = buildTelegramProgress(
      links,
      [status("a", "pending"), status("b", "completed")],
      1
    );
    expect(renderProgressDraft(result)).toBe("Processing link: a.com");
  });

  it("two users in same DO, interleaved", () => {
    const links = [
      link("u1-a", "a.com", 100, 1),
      link("u2-a", "x.com", 200, 2),
      link("u1-b", "b.com", 100, 1),
    ];
    const statuses = [status("u1-a", "pending"), status("u2-a", "pending")];

    const user1 = buildTelegramProgress(links, statuses, 100);
    expect(renderProgressDraft(user1)).toBe(
      "Processing link: a.com\nSaving link: b.com"
    );

    const user2 = buildTelegramProgress(links, statuses, 200);
    expect(renderProgressDraft(user2)).toBe("Processing link: x.com");
  });

  it("non-telegram + telegram mixed: only telegram shown", () => {
    const links = [
      link("tg1", "a.com"),
      {
        id: "app1",
        source: "app",
        sourceMeta: null,
        domain: "b.com",
        url: "https://b.com",
      },
    ];
    const result = buildTelegramProgress(links, [], 1);
    expect(result.size).toBe(1);
    expect(result.get("tg1")?.domain).toBe("a.com");
  });

  it("DO eviction recovery: state derived from store, not memory", () => {
    const links = [link("l1", "a.com")];
    const statuses = [status("l1", "pending")];

    const result = buildTelegramProgress(links, statuses, 1);
    expect(renderProgressDraft(result)).toBe("Processing link: a.com");
  });

  it("3 links staggered: two processing, one saving, first completes", () => {
    const links = [
      link("l1", "a.com"),
      link("l2", "b.com"),
      link("l3", "c.com"),
    ];

    // l1 and l2 processing, l3 still saving
    let result = buildTelegramProgress(
      links,
      [status("l1", "pending"), status("l2", "pending")],
      1
    );
    expect(renderProgressDraft(result)).toBe(
      "Processing link: a.com\nProcessing link: b.com\nSaving link: c.com"
    );

    // l1 done, l3 starts processing
    result = buildTelegramProgress(
      links,
      [
        status("l1", "completed"),
        status("l2", "pending"),
        status("l3", "pending"),
      ],
      1
    );
    expect(renderProgressDraft(result)).toBe(
      "Processing link: b.com\nProcessing link: c.com"
    );

    // l2 done
    result = buildTelegramProgress(
      links,
      [
        status("l1", "completed"),
        status("l2", "completed"),
        status("l3", "pending"),
      ],
      1
    );
    expect(renderProgressDraft(result)).toBe("Processing link: c.com");

    // all done
    result = buildTelegramProgress(
      links,
      [
        status("l1", "completed"),
        status("l2", "completed"),
        status("l3", "completed"),
      ],
      1
    );
    expect(result.size).toBe(0);
  });

  it("failed link excluded from draft", () => {
    const links = [link("l1", "a.com"), link("l2", "b.com")];
    const result = buildTelegramProgress(
      links,
      [status("l1", "failed"), status("l2", "pending")],
      1
    );
    expect(renderProgressDraft(result)).toBe("Processing link: b.com");
  });

  it("cancelled link excluded from draft", () => {
    const links = [link("l1", "a.com"), link("l2", "b.com")];
    const result = buildTelegramProgress(links, [status("l1", "cancelled")], 1);
    expect(renderProgressDraft(result)).toBe("Saving link: b.com");
  });

  it("reprocess-requested link shown as saving", () => {
    const links = [link("l1", "a.com")];
    const result = buildTelegramProgress(
      links,
      [status("l1", "reprocess-requested")],
      1
    );
    expect(renderProgressDraft(result)).toBe("Saving link: a.com");
  });

  it("link with null source excluded", () => {
    const nullSourceLink = {
      id: "l1",
      source: null,
      sourceMeta: null,
      domain: "example.com",
      url: "https://example.com",
    };
    const result = buildTelegramProgress([nullSourceLink], [], 1);
    expect(result.size).toBe(0);
  });

  it("telegram link with malformed sourceMeta excluded", () => {
    const badMetaLink = {
      id: "l1",
      source: "telegram" as string | null,
      sourceMeta: "not-json",
      domain: "a.com",
      url: "https://a.com",
    };
    const result = buildTelegramProgress([badMetaLink], [], 1);
    expect(result.size).toBe(0);
  });
});

describe("parseMeta", () => {
  it("returns null for null input", () => {
    expect(parseMeta(null)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseMeta("not-json")).toBeNull();
  });

  it("returns null when chatId is missing", () => {
    expect(parseMeta(JSON.stringify({ messageId: 1 }))).toBeNull();
  });

  it("returns null when messageId is missing", () => {
    expect(parseMeta(JSON.stringify({ chatId: 1 }))).toBeNull();
  });

  it("returns null when chatId is not a number", () => {
    expect(
      parseMeta(JSON.stringify({ chatId: "abc", messageId: 1 }))
    ).toBeNull();
  });

  it("parses valid sourceMeta", () => {
    const result = parseMeta(JSON.stringify({ chatId: 123, messageId: 456 }));
    expect(result).toEqual({ chatId: 123, messageId: 456 });
  });

  it("ignores extra fields", () => {
    const result = parseMeta(
      JSON.stringify({ chatId: 1, messageId: 2, extra: "ignored" })
    );
    expect(result).toEqual({ chatId: 1, messageId: 2 });
  });
});

describe("evictOldestFromSet", () => {
  it("does nothing when set is under max size", () => {
    const set = new Set(["a", "b", "c"]);
    evictOldestFromSet(set, 5);
    expect(set.size).toBe(3);
  });

  it("does nothing when set is exactly at max size", () => {
    const set = new Set(["a", "b", "c"]);
    evictOldestFromSet(set, 3);
    expect(set.size).toBe(3);
  });

  it("evicts oldest entries when over max size", () => {
    const set = new Set(["a", "b", "c", "d", "e"]);
    evictOldestFromSet(set, 3);
    expect(set.size).toBe(3);
    expect(set.has("a")).toBe(false);
    expect(set.has("b")).toBe(false);
    expect(set.has("c")).toBe(true);
    expect(set.has("d")).toBe(true);
    expect(set.has("e")).toBe(true);
  });

  it("evicts single excess entry", () => {
    const set = new Set(["a", "b", "c"]);
    evictOldestFromSet(set, 2);
    expect(set.size).toBe(2);
    expect(set.has("a")).toBe(false);
    expect(set.has("b")).toBe(true);
    expect(set.has("c")).toBe(true);
  });

  it("handles eviction to zero", () => {
    const set = new Set(["a", "b"]);
    evictOldestFromSet(set, 0);
    expect(set.size).toBe(0);
  });
});

describe("semaphore concurrency", () => {
  it.effect("processes up to N concurrently, queues the rest", () => {
    const semaphore = Effect.unsafeMakeSemaphore(2);
    const running = { current: 0, max: 0 };

    const process = () =>
      semaphore.withPermits(1)(
        Effect.gen(function* () {
          running.current++;
          running.max = Math.max(running.max, running.current);
          yield* Effect.yieldNow();
          running.current--;
        })
      );

    return Effect.forEach(["a", "b", "c", "d", "e"], () => process(), {
      concurrency: "unbounded",
      discard: true,
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(running.max).toBe(2);
          expect(running.current).toBe(0);
        })
      )
    );
  });

  it.effect("releases permit on defect so other work proceeds", () => {
    const semaphore = Effect.unsafeMakeSemaphore(1);
    const results: string[] = [];

    return Effect.forEach(
      ["fail", "ok"],
      (id) =>
        semaphore.withPermits(1)(
          Effect.gen(function* () {
            if (id === "fail") {
              return yield* Effect.die("boom");
            }
            results.push(id);
          }).pipe(Effect.catchAllDefect(() => Effect.void))
        ),
      { concurrency: "unbounded", discard: true }
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(results).toEqual(["ok"]);
        })
      )
    );
  });

  it.effect("dedup set prevents double-submission of same link", () => {
    const submitted = new Set<string>();
    const processed: string[] = [];

    const submit = (ids: string[]) => {
      const newIds = ids.filter((id) => !submitted.has(id));
      for (const id of newIds) submitted.add(id);
      return newIds;
    };

    // First subscription fire
    const batch1 = submit(["a", "b"]);
    expect(batch1).toEqual(["a", "b"]);

    // Second fire with overlapping ids
    const batch2 = submit(["a", "b", "c"]);
    expect(batch2).toEqual(["c"]);

    return Effect.forEach(
      [...batch1, ...batch2],
      (id) =>
        Effect.sync(() => {
          processed.push(id);
        }),
      { discard: true }
    ).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(processed).toEqual(["a", "b", "c"]);
        })
      )
    );
  });
});
