// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { events, tables } from "../../schema";
import { makeTestStore, testId } from "../test-helpers";
import type { TestStore } from "../test-helpers";

describe("tag-suggestions materializer", () => {
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

  const seedTag = (id: string, name = "Tag") =>
    store.commit(
      events.tagCreated({
        id,
        name,
        sortOrder: 0,
        createdAt: new Date("2026-01-01T10:00:00Z"),
      })
    );

  describe("v1.TagSuggested", () => {
    it("inserts a suggestion with tagId set and status=pending (hard-coded by materializer)", () => {
      const linkId = testId("link");
      const tagId = testId("tag");
      seedLink(linkId);
      seedTag(tagId, "Reading");

      const id = testId("sug");
      const suggestedAt = new Date("2026-01-02T10:00:00Z");
      store.commit(
        events.tagSuggested({
          id,
          linkId,
          tagId,
          suggestedName: "Reading",
          model: "gpt-4o-mini",
          suggestedAt,
        })
      );

      const rows = store.query(tables.tagSuggestions.where({ id }));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id,
        linkId,
        tagId,
        suggestedName: "Reading",
        model: "gpt-4o-mini",
        status: "pending",
      });
      expect(rows[0].suggestedAt.getTime()).toBe(suggestedAt.getTime());
    });

    it("inserts a suggestion with tagId=null for a brand-new tag name", () => {
      const linkId = testId("link");
      seedLink(linkId);

      const id = testId("sug");
      const suggestedAt = new Date("2026-01-02T10:00:00Z");
      store.commit(
        events.tagSuggested({
          id,
          linkId,
          tagId: null,
          suggestedName: "BrandNew",
          model: "gpt-4o-mini",
          suggestedAt,
        })
      );

      const row = store.query(tables.tagSuggestions.where({ id }))[0];
      expect(row).toMatchObject({
        id,
        linkId,
        tagId: null,
        suggestedName: "BrandNew",
        status: "pending",
      });
    });
  });

  describe("v1.TagSuggestionAccepted", () => {
    it("updates status to accepted", () => {
      const linkId = testId("link");
      seedLink(linkId);
      const id = testId("sug");
      store.commit(
        events.tagSuggested({
          id,
          linkId,
          tagId: null,
          suggestedName: "X",
          model: "m",
          suggestedAt: new Date("2026-01-02T10:00:00Z"),
        })
      );

      store.commit(events.tagSuggestionAccepted({ id }));

      const row = store.query(tables.tagSuggestions.where({ id }))[0];
      expect(row.status).toBe("accepted");
    });
  });

  describe("v1.TagSuggestionDismissed", () => {
    it("updates status to dismissed", () => {
      const linkId = testId("link");
      seedLink(linkId);
      const id = testId("sug");
      store.commit(
        events.tagSuggested({
          id,
          linkId,
          tagId: null,
          suggestedName: "X",
          model: "m",
          suggestedAt: new Date("2026-01-02T10:00:00Z"),
        })
      );

      store.commit(events.tagSuggestionDismissed({ id }));

      const row = store.query(tables.tagSuggestions.where({ id }))[0];
      expect(row.status).toBe("dismissed");
    });
  });
});
