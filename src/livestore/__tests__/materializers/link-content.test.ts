// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { events, tables } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

describe("link-content materializers", () => {
  let store: TestStore;

  beforeEach(async () => {
    store = await makeTestStore();
  });

  afterEach(async () => {
    await store.shutdownPromise?.();
  });

  const seedLink = (id: string) =>
    store.commit(
      events.linkCreatedV2({
        id,
        url: `https://example.com/${id}`,
        domain: "example.com",
        createdAt: new Date("2026-01-01T10:00:00Z"),
        source: "manual",
        sourceMeta: null,
      })
    );

  describe("v1.LinkMetadataFetched", () => {
    it("inserts a link_snapshots row with all fields populated", () => {
      const linkId = testId("link");
      seedLink(linkId);

      const snapshotId = testId("snap");
      const fetchedAt = new Date("2026-01-02T10:00:00Z");
      store.commit(
        events.linkMetadataFetched({
          id: snapshotId,
          linkId,
          title: "Example Page",
          description: "A description",
          image: "https://cdn.example.com/img.png",
          favicon: "https://example.com/favicon.ico",
          fetchedAt,
        })
      );

      const rows = store.query(tables.linkSnapshots.where({ linkId }));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: snapshotId,
        linkId,
        title: "Example Page",
        description: "A description",
        image: "https://cdn.example.com/img.png",
        favicon: "https://example.com/favicon.ico",
      });
      expect(rows[0].fetchedAt).toBeInstanceOf(Date);
      expect(rows[0].fetchedAt.getTime()).toBe(fetchedAt.getTime());
    });

    it("inserts a link_snapshots row with null optional fields", () => {
      const linkId = testId("link");
      seedLink(linkId);

      const snapshotId = testId("snap");
      const fetchedAt = new Date("2026-01-02T10:00:00Z");
      store.commit(
        events.linkMetadataFetched({
          id: snapshotId,
          linkId,
          title: null,
          description: null,
          image: null,
          favicon: null,
          fetchedAt,
        })
      );

      const row = store.query(tables.linkSnapshots.where({ linkId }))[0];
      expect(row).toMatchObject({
        id: snapshotId,
        linkId,
        title: null,
        description: null,
        image: null,
        favicon: null,
      });
      expect(row.fetchedAt.getTime()).toBe(fetchedAt.getTime());
    });
  });

  describe("v1.LinkSummarized", () => {
    it("inserts a link_summaries row", () => {
      const linkId = testId("link");
      seedLink(linkId);

      const id = testId("sum");
      const summarizedAt = new Date("2026-01-02T10:00:00Z");
      store.commit(
        events.linkSummarized({
          id,
          linkId,
          summary: "A concise summary.",
          model: "gpt-4o-mini",
          summarizedAt,
        })
      );

      const rows = store.query(tables.linkSummaries.where({ linkId }));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        linkId,
        summary: "A concise summary.",
        model: "gpt-4o-mini",
      });
      expect(rows[0].summarizedAt).toBeInstanceOf(Date);
      expect(rows[0].summarizedAt.getTime()).toBe(summarizedAt.getTime());
    });
  });

  describe("v1.LinkInteracted", () => {
    it("inserts a link_interactions row", () => {
      const linkId = testId("link");
      seedLink(linkId);

      const id = testId("int");
      const occurredAt = new Date("2026-01-02T10:00:00Z");
      store.commit(
        events.linkInteracted({
          id,
          linkId,
          type: "opened",
          occurredAt,
        })
      );

      const rows = store.query(tables.linkInteractions.where({ linkId }));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        linkId,
        type: "opened",
      });
      expect(rows[0].occurredAt).toBeInstanceOf(Date);
      expect(rows[0].occurredAt.getTime()).toBe(occurredAt.getTime());
    });
  });
});
