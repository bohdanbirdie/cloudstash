// @vitest-environment jsdom
import { it, describe, expect, beforeEach, afterEach } from "@effect/vitest";
import { Effect } from "effect";

import { makeTestStore } from "../../../livestore/__tests__/test-helpers";
import type { TestStore } from "../../../livestore/__tests__/test-helpers";
import { events, tables } from "../../../livestore/schema";
import { LinkRepository } from "../../link-processor/services";
import { LinkRepositoryLive } from "../../link-processor/services/link-repository.live";

let store: TestStore;

beforeEach(async () => {
  store = await makeTestStore();
});

afterEach(async () => {
  await store.shutdownPromise?.();
});

const seedLink = (
  overrides: {
    id?: string;
    url?: string;
    domain?: string;
    createdAt?: Date;
    source?: string;
    sourceMeta?: string | null;
    deletedAt?: Date | null;
  } = {}
) => {
  const id = overrides.id ?? "link-1";
  const url = overrides.url ?? `https://example.com/${id}`;
  const createdAt = overrides.createdAt ?? new Date("2026-01-01T00:00:00Z");
  store.commit(
    events.linkCreatedV2({
      id,
      url,
      domain: overrides.domain ?? "example.com",
      createdAt,
      source: overrides.source ?? "test",
      sourceMeta: overrides.sourceMeta ?? null,
    })
  );
  if (overrides.deletedAt) {
    store.commit(events.linkDeleted({ id, deletedAt: overrides.deletedAt }));
  }
  return id;
};

// Focused unit coverage for the LinkRepositoryLive service wrapper.
// do-programs.test.ts exercises these methods transitively through ingestLink,
// cancelStaleLinks, and notifyResult; this file asserts each operation in
// isolation so regressions to the Effect.sync wrapper itself are caught
// locally. LinkRepositoryLive returns raw query rows (no branded-id wrapping),
// so assertions below intentionally match on plain string ids.
describe("LinkRepositoryLive", () => {
  describe("findByUrl", () => {
    it.effect("returns the matching link row", () =>
      Effect.gen(function* () {
        seedLink({ id: "link-1", url: "https://wanted.test/" });
        seedLink({ id: "link-2", url: "https://other.test/" });
        const repo = yield* LinkRepository;
        const result = yield* repo.findByUrl("https://wanted.test/");
        expect(result).not.toBeNull();
        expect(result!.id).toBe("link-1");
        expect(result!.url).toBe("https://wanted.test/");
      }).pipe(Effect.provide(LinkRepositoryLive(store)))
    );

    it.effect("returns null when no link matches", () =>
      Effect.gen(function* () {
        seedLink({ id: "link-1", url: "https://wanted.test/" });
        const repo = yield* LinkRepository;
        const result = yield* repo.findByUrl("https://missing.test/");
        expect(result).toBeNull();
      }).pipe(Effect.provide(LinkRepositoryLive(store)))
    );
  });

  describe("queryActiveLinks", () => {
    it.effect("excludes soft-deleted links", () =>
      Effect.gen(function* () {
        seedLink({ id: "l-a" });
        seedLink({ id: "l-b" });
        seedLink({
          id: "l-deleted",
          deletedAt: new Date("2026-02-01T00:00:00Z"),
        });
        const repo = yield* LinkRepository;
        const result = yield* repo.queryActiveLinks();
        const ids = result.map((l) => l.id).toSorted();
        expect(ids).toEqual(["l-a", "l-b"]);
      }).pipe(Effect.provide(LinkRepositoryLive(store)))
    );

    it.effect("returns empty when nothing seeded", () =>
      Effect.gen(function* () {
        const repo = yield* LinkRepository;
        const result = yield* repo.queryActiveLinks();
        expect(result).toEqual([]);
      }).pipe(Effect.provide(LinkRepositoryLive(store)))
    );
  });

  describe("queryStatuses", () => {
    it.effect("returns processing status rows", () =>
      Effect.gen(function* () {
        seedLink({ id: "l-1" });
        seedLink({ id: "l-2" });
        store.commit(
          events.linkProcessingStarted({
            linkId: "l-1",
            updatedAt: new Date("2026-01-02T00:00:00Z"),
          })
        );
        store.commit(
          events.linkProcessingStarted({
            linkId: "l-2",
            updatedAt: new Date("2026-01-03T00:00:00Z"),
          })
        );
        store.commit(
          events.linkProcessingCompleted({
            linkId: "l-2",
            updatedAt: new Date("2026-01-04T00:00:00Z"),
          })
        );

        const repo = yield* LinkRepository;
        const result = yield* repo.queryStatuses();
        const byId = new Map(result.map((s) => [s.linkId, s]));
        expect(byId.size).toBe(2);
        expect(byId.get("l-1")!.status).toBe("pending");
        expect(byId.get("l-2")!.status).toBe("completed");
      }).pipe(Effect.provide(LinkRepositoryLive(store)))
    );

    it.effect("returns empty when no status rows", () =>
      Effect.gen(function* () {
        const repo = yield* LinkRepository;
        const result = yield* repo.queryStatuses();
        expect(result).toEqual([]);
      }).pipe(Effect.provide(LinkRepositoryLive(store)))
    );
  });

  describe("commitEvent", () => {
    it.effect("commits an event through to the store", () =>
      Effect.gen(function* () {
        const repo = yield* LinkRepository;
        yield* repo.commitEvent(
          events.linkCreatedV2({
            id: "committed-link",
            url: "https://committed.test/",
            domain: "committed.test",
            createdAt: new Date("2026-01-01T00:00:00Z"),
            source: "test",
            sourceMeta: null,
          })
        );
        const rows = store.query(tables.links.where({ id: "committed-link" }));
        expect(rows).toHaveLength(1);
        expect(rows[0].url).toBe("https://committed.test/");
      }).pipe(Effect.provide(LinkRepositoryLive(store)))
    );
  });
});
