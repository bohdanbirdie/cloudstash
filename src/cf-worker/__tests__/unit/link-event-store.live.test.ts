// @vitest-environment jsdom
import { it, describe, expect, beforeEach, afterEach } from "@effect/vitest";
import { Effect } from "effect";

import {
  makeTestStore,
  testId,
} from "../../../livestore/__tests__/test-helpers";
import type { TestStore } from "../../../livestore/__tests__/test-helpers";
import { events, tables } from "../../../livestore/schema";
import { LinkId, TagId } from "../../db/branded";
import { LinkEventStore } from "../../link-processor/services";
import { LinkEventStoreLive } from "../../link-processor/services/link-event-store.live";

let store: TestStore;

beforeEach(async () => {
  store = await makeTestStore();
});

afterEach(async () => {
  await store.shutdownPromise?.();
});

const seedTag = (id: string, name: string, deletedAt: Date | null = null) => {
  store.commit(
    events.tagCreated({
      id,
      name,
      sortOrder: 0,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    })
  );
  if (deletedAt) store.commit(events.tagDeleted({ id, deletedAt }));
};

const seedLink = (id: string, url = `https://example.com/${id}`) =>
  store.commit(
    events.linkCreatedV2({
      id,
      url,
      domain: "example.com",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      source: "test",
      sourceMeta: null,
    })
  );

describe("LinkEventStoreLive", () => {
  describe("commit", () => {
    it.effect("commits through to the store", () =>
      Effect.gen(function* () {
        const svc = yield* LinkEventStore;
        yield* svc.commit(
          events.linkCreatedV2({
            id: "link-commit",
            url: "https://commit.test/",
            domain: "commit.test",
            createdAt: new Date("2026-01-01T00:00:00Z"),
            source: "test",
            sourceMeta: null,
          })
        );
        const rows = store.query(tables.links.where({ id: "link-commit" }));
        expect(rows).toHaveLength(1);
        expect(rows[0].url).toBe("https://commit.test/");
      }).pipe(Effect.provide(LinkEventStoreLive(store)))
    );
  });

  describe("queryTags", () => {
    it.effect("returns only non-deleted tags with branded TagId", () =>
      Effect.gen(function* () {
        seedTag("tag-1", "alpha");
        seedTag("tag-2", "beta");
        seedTag("tag-3", "gamma", new Date("2026-02-01T00:00:00Z"));

        const svc = yield* LinkEventStore;
        const result = yield* svc.queryTags();

        expect(result).toHaveLength(2);
        const byName = new Map(result.map((t) => [t.name, t]));
        expect(byName.get("alpha")?.id).toBe(TagId.make("tag-1"));
        expect(byName.get("beta")?.id).toBe(TagId.make("tag-2"));
        expect(byName.has("gamma")).toBe(false);
      }).pipe(Effect.provide(LinkEventStoreLive(store)))
    );

    it.effect("returns empty when no tags exist", () =>
      Effect.gen(function* () {
        const svc = yield* LinkEventStore;
        const result = yield* svc.queryTags();
        expect(result).toEqual([]);
      }).pipe(Effect.provide(LinkEventStoreLive(store)))
    );
  });

  describe("queryLinkTagNames", () => {
    it.effect(
      "returns union of applied tags and non-dismissed suggestions",
      () =>
        Effect.gen(function* () {
          const linkId = LinkId.make("link-1");
          seedLink(linkId);
          seedTag("tag-a", "react");
          seedTag("tag-b", "typescript");

          // Apply "react" tag
          store.commit(
            events.linkTagged({
              id: testId("lt"),
              linkId,
              tagId: "tag-a",
              createdAt: new Date("2026-01-02T00:00:00Z"),
            })
          );
          // Suggest "graphql" (pending, not applied)
          store.commit(
            events.tagSuggested({
              id: "sugg-1",
              linkId,
              model: "m",
              suggestedAt: new Date("2026-01-03T00:00:00Z"),
              suggestedName: "graphql",
              tagId: null,
            })
          );

          const svc = yield* LinkEventStore;
          const names = yield* svc.queryLinkTagNames(linkId);

          expect([...names].toSorted()).toEqual(["graphql", "react"]);
        }).pipe(Effect.provide(LinkEventStoreLive(store)))
    );

    it.effect("dedups names that are both applied and suggested", () =>
      Effect.gen(function* () {
        const linkId = LinkId.make("link-1");
        seedLink(linkId);
        seedTag("tag-a", "react");

        store.commit(
          events.linkTagged({
            id: testId("lt"),
            linkId,
            tagId: "tag-a",
            createdAt: new Date("2026-01-02T00:00:00Z"),
          })
        );
        // Suggested with the same name as the applied tag.
        store.commit(
          events.tagSuggested({
            id: "sugg-dup",
            linkId,
            model: "m",
            suggestedAt: new Date("2026-01-03T00:00:00Z"),
            suggestedName: "react",
            tagId: "tag-a",
          })
        );

        const svc = yield* LinkEventStore;
        const names = yield* svc.queryLinkTagNames(linkId);
        expect([...names]).toEqual(["react"]);
      }).pipe(Effect.provide(LinkEventStoreLive(store)))
    );

    it.effect("excludes dismissed suggestions", () =>
      Effect.gen(function* () {
        const linkId = LinkId.make("link-1");
        seedLink(linkId);

        store.commit(
          events.tagSuggested({
            id: "sugg-1",
            linkId,
            model: "m",
            suggestedAt: new Date("2026-01-03T00:00:00Z"),
            suggestedName: "kept",
            tagId: null,
          })
        );
        store.commit(
          events.tagSuggested({
            id: "sugg-2",
            linkId,
            model: "m",
            suggestedAt: new Date("2026-01-03T00:00:00Z"),
            suggestedName: "dropped",
            tagId: null,
          })
        );
        store.commit(events.tagSuggestionDismissed({ id: "sugg-2" }));

        const svc = yield* LinkEventStore;
        const names = yield* svc.queryLinkTagNames(linkId);
        expect([...names]).toEqual(["kept"]);
      }).pipe(Effect.provide(LinkEventStoreLive(store)))
    );

    it.effect("excludes applied rows whose tag has been deleted", () =>
      Effect.gen(function* () {
        const linkId = LinkId.make("link-1");
        seedLink(linkId);
        seedTag("tag-live", "live-tag");
        seedTag("tag-dead", "dead-tag", new Date("2026-02-01T00:00:00Z"));

        store.commit(
          events.linkTagged({
            id: testId("lt"),
            linkId,
            tagId: "tag-live",
            createdAt: new Date("2026-01-02T00:00:00Z"),
          })
        );
        // The tagDeleted materializer cascades to remove link_tags rows,
        // so the name would be excluded anyway. The service's in-memory
        // filter (keeping only tags in the non-deleted map) is defense in
        // depth and is not separately exercised here.
        store.commit(
          events.linkTagged({
            id: testId("lt"),
            linkId,
            tagId: "tag-dead",
            createdAt: new Date("2026-01-02T00:00:00Z"),
          })
        );
        store.commit(
          events.tagDeleted({
            id: "tag-dead",
            deletedAt: new Date("2026-02-02T00:00:00Z"),
          })
        );

        const svc = yield* LinkEventStore;
        const names = yield* svc.queryLinkTagNames(linkId);
        expect([...names]).toEqual(["live-tag"]);
      }).pipe(Effect.provide(LinkEventStoreLive(store)))
    );

    it.effect(
      "returns empty when link has no applied tags and no suggestions",
      () =>
        Effect.gen(function* () {
          const linkId = LinkId.make("link-empty");
          seedLink(linkId);
          const svc = yield* LinkEventStore;
          const names = yield* svc.queryLinkTagNames(linkId);
          expect([...names]).toEqual([]);
        }).pipe(Effect.provide(LinkEventStoreLive(store)))
    );
  });
});
