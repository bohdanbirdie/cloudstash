// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { events, tables } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

describe("link-processing materializer", () => {
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

  describe("v1.LinkProcessingStarted", () => {
    it("inserts a new row with status=pending and notified=0", () => {
      const linkId = testId("link");
      seedLink(linkId);
      const updatedAt = new Date("2026-01-02T10:00:00Z");

      store.commit(events.linkProcessingStarted({ linkId, updatedAt }));

      const rows = store.query(tables.linkProcessingStatus.where({ linkId }));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        linkId,
        status: "pending",
        error: null,
        notified: 0,
      });
      expect(rows[0].updatedAt.getTime()).toBe(updatedAt.getTime());
    });

    it("after a failed state, re-starting resets error and status", () => {
      const linkId = testId("link");
      seedLink(linkId);

      store.commit(
        events.linkProcessingStarted({
          linkId,
          updatedAt: new Date("2026-01-02T10:00:00Z"),
        })
      );
      store.commit(
        events.linkProcessingFailed({
          linkId,
          error: "boom",
          updatedAt: new Date("2026-01-02T11:00:00Z"),
        })
      );

      let row = store.query(tables.linkProcessingStatus.where({ linkId }))[0];
      expect(row.status).toBe("failed");
      expect(row.error).toBe("boom");

      const restartedAt = new Date("2026-01-02T12:00:00Z");
      store.commit(
        events.linkProcessingStarted({ linkId, updatedAt: restartedAt })
      );

      row = store.query(tables.linkProcessingStatus.where({ linkId }))[0];
      expect(row.status).toBe("pending");
      expect(row.error).toBeNull();
      expect(row.updatedAt.getTime()).toBe(restartedAt.getTime());
    });
  });

  describe("v1.LinkProcessingCompleted", () => {
    it("sets status=completed on an existing row", () => {
      const linkId = testId("link");
      seedLink(linkId);
      store.commit(
        events.linkProcessingStarted({
          linkId,
          updatedAt: new Date("2026-01-02T10:00:00Z"),
        })
      );

      const updatedAt = new Date("2026-01-02T11:00:00Z");
      store.commit(events.linkProcessingCompleted({ linkId, updatedAt }));

      const row = store.query(tables.linkProcessingStatus.where({ linkId }))[0];
      expect(row.status).toBe("completed");
      expect(row.updatedAt.getTime()).toBe(updatedAt.getTime());
    });
  });

  describe("v1.LinkProcessingFailed", () => {
    it("sets status=failed and populates error", () => {
      const linkId = testId("link");
      seedLink(linkId);
      store.commit(
        events.linkProcessingStarted({
          linkId,
          updatedAt: new Date("2026-01-02T10:00:00Z"),
        })
      );

      const updatedAt = new Date("2026-01-02T11:00:00Z");
      store.commit(
        events.linkProcessingFailed({
          linkId,
          error: "network timeout",
          updatedAt,
        })
      );

      const row = store.query(tables.linkProcessingStatus.where({ linkId }))[0];
      expect(row.status).toBe("failed");
      expect(row.error).toBe("network timeout");
      expect(row.updatedAt.getTime()).toBe(updatedAt.getTime());
    });
  });

  describe("v1.LinkProcessingCancelled", () => {
    it("inserts a cancelled row when no prior row exists", () => {
      const linkId = testId("link");
      seedLink(linkId);

      const updatedAt = new Date("2026-01-02T10:00:00Z");
      store.commit(events.linkProcessingCancelled({ linkId, updatedAt }));

      const rows = store.query(tables.linkProcessingStatus.where({ linkId }));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        linkId,
        status: "cancelled",
        error: null,
        notified: 0,
      });
      expect(rows[0].updatedAt.getTime()).toBe(updatedAt.getTime());
    });

    it("replaces an existing row on conflict", () => {
      const linkId = testId("link");
      seedLink(linkId);
      store.commit(
        events.linkProcessingStarted({
          linkId,
          updatedAt: new Date("2026-01-02T10:00:00Z"),
        })
      );
      store.commit(
        events.linkProcessingFailed({
          linkId,
          error: "boom",
          updatedAt: new Date("2026-01-02T11:00:00Z"),
        })
      );
      store.commit(
        events.linkSourceNotified({
          linkId,
          notifiedAt: new Date("2026-01-02T11:30:00Z"),
        })
      );

      const cancelledAt = new Date("2026-01-02T12:00:00Z");
      store.commit(
        events.linkProcessingCancelled({ linkId, updatedAt: cancelledAt })
      );

      const row = store.query(tables.linkProcessingStatus.where({ linkId }))[0];
      expect(row).toMatchObject({
        linkId,
        status: "cancelled",
        error: null,
        notified: 0,
      });
      expect(row.updatedAt.getTime()).toBe(cancelledAt.getTime());
    });
  });

  describe("v1.LinkReprocessRequested", () => {
    it("updates status to reprocess-requested and clears error", () => {
      const linkId = testId("link");
      seedLink(linkId);
      store.commit(
        events.linkProcessingStarted({
          linkId,
          updatedAt: new Date("2026-01-02T10:00:00Z"),
        })
      );
      store.commit(
        events.linkProcessingFailed({
          linkId,
          error: "earlier error",
          updatedAt: new Date("2026-01-02T11:00:00Z"),
        })
      );

      const requestedAt = new Date("2026-01-02T12:00:00Z");
      store.commit(events.linkReprocessRequested({ linkId, requestedAt }));

      const row = store.query(tables.linkProcessingStatus.where({ linkId }))[0];
      expect(row.status).toBe("reprocess-requested");
      expect(row.error).toBeNull();
      expect(row.updatedAt.getTime()).toBe(requestedAt.getTime());
    });
  });

  describe("v1.LinkSourceNotified", () => {
    it("sets notified=1 on an existing row", () => {
      const linkId = testId("link");
      seedLink(linkId);
      store.commit(
        events.linkProcessingStarted({
          linkId,
          updatedAt: new Date("2026-01-02T10:00:00Z"),
        })
      );

      store.commit(
        events.linkSourceNotified({
          linkId,
          notifiedAt: new Date("2026-01-02T11:00:00Z"),
        })
      );

      const row = store.query(tables.linkProcessingStatus.where({ linkId }))[0];
      expect(row.notified).toBe(1);
    });
  });
});
