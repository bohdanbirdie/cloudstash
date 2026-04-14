// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { events, tables } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

describe("links materializer", () => {
  let store: TestStore;

  beforeEach(async () => {
    store = await makeTestStore();
  });

  afterEach(async () => {
    await store.shutdownPromise?.();
  });

  describe("v1.LinkCreated", () => {
    it("inserts a new link with status=unread and null source", () => {
      const id = testId("link");
      const createdAt = new Date("2026-01-01T10:00:00Z");

      store.commit(
        events.linkCreated({
          id,
          url: "https://example.com/a",
          domain: "example.com",
          createdAt,
        })
      );

      const rows = store.query(tables.links.where({ id }));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        url: "https://example.com/a",
        domain: "example.com",
        status: "unread",
        source: null,
        sourceMeta: null,
        completedAt: null,
        deletedAt: null,
      });
      expect(rows[0].createdAt.getTime()).toBe(createdAt.getTime());
    });

    it("ignores duplicate URL via unique index", () => {
      const createdAt = new Date("2026-01-01T10:00:00Z");
      store.commit(
        events.linkCreated({
          id: testId("link"),
          url: "https://example.com/same",
          domain: "example.com",
          createdAt,
        })
      );
      store.commit(
        events.linkCreated({
          id: testId("link"),
          url: "https://example.com/same",
          domain: "example.com",
          createdAt: new Date("2026-01-02T10:00:00Z"),
        })
      );

      const rows = store.query(
        tables.links.where({ url: "https://example.com/same" })
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].createdAt.getTime()).toBe(createdAt.getTime());
    });
  });

  describe("v2.LinkCreated", () => {
    it("inserts a link with source and sourceMeta", () => {
      const id = testId("link");
      const createdAt = new Date("2026-01-01T10:00:00Z");

      store.commit(
        events.linkCreatedV2({
          id,
          url: "https://example.com/v2",
          domain: "example.com",
          createdAt,
          source: "telegram",
          sourceMeta: JSON.stringify({ chatId: 42 }),
        })
      );

      const rows = store.query(tables.links.where({ id }));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        source: "telegram",
        sourceMeta: JSON.stringify({ chatId: 42 }),
        status: "unread",
      });
    });

    it("also respects the url unique index across v1 and v2", () => {
      const createdAt = new Date("2026-01-01T10:00:00Z");
      store.commit(
        events.linkCreated({
          id: testId("link"),
          url: "https://example.com/mix",
          domain: "example.com",
          createdAt,
        })
      );
      store.commit(
        events.linkCreatedV2({
          id: testId("link"),
          url: "https://example.com/mix",
          domain: "example.com",
          createdAt: new Date("2026-01-02T10:00:00Z"),
          source: "telegram",
          sourceMeta: null,
        })
      );

      const rows = store.query(
        tables.links.where({ url: "https://example.com/mix" })
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].source).toBeNull();
    });
  });

  describe("completion lifecycle", () => {
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

    it("LinkCompleted sets status=completed and completedAt", () => {
      const id = testId("link");
      seedLink(id);
      const completedAt = new Date("2026-01-03T10:00:00Z");
      store.commit(events.linkCompleted({ id, completedAt }));

      const row = store.query(tables.links.where({ id }))[0];
      expect(row.status).toBe("completed");
      expect(row.completedAt?.getTime()).toBe(completedAt.getTime());
    });

    it("LinkUncompleted resets status to unread and clears completedAt", () => {
      const id = testId("link");
      seedLink(id);
      store.commit(
        events.linkCompleted({
          id,
          completedAt: new Date("2026-01-03T10:00:00Z"),
        })
      );
      store.commit(events.linkUncompleted({ id }));

      const row = store.query(tables.links.where({ id }))[0];
      expect(row.status).toBe("unread");
      expect(row.completedAt).toBeNull();
    });
  });

  describe("soft delete lifecycle", () => {
    it("LinkDeleted sets deletedAt; LinkRestored clears it", () => {
      const id = testId("link");
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

      const deletedAt = new Date("2026-01-05T10:00:00Z");
      store.commit(events.linkDeleted({ id, deletedAt }));
      let row = store.query(tables.links.where({ id }))[0];
      expect(row.deletedAt?.getTime()).toBe(deletedAt.getTime());

      store.commit(events.linkRestored({ id }));
      row = store.query(tables.links.where({ id }))[0];
      expect(row.deletedAt).toBeNull();
    });
  });
});
