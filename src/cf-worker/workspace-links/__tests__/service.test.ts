import { it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect } from "vitest";

import { makeTestStore } from "@/livestore/__tests__/test-helpers";
import type { TestStore } from "@/livestore/__tests__/test-helpers";
import { events } from "@/livestore/schema";

import { WorkspaceLinkRepositoryLive } from "../repository";
import { WorkspaceLinks } from "../service";

describe("WorkspaceLinks", () => {
  let store: TestStore;

  beforeEach(async () => {
    store = await makeTestStore();
  });

  afterEach(async () => {
    await store.shutdownPromise?.();
  });

  const run = <Value, Error>(
    effect: Effect.Effect<Value, Error, WorkspaceLinks>
  ) =>
    effect.pipe(
      Effect.provide(
        WorkspaceLinks.layer.pipe(
          Layer.provide(WorkspaceLinkRepositoryLive(store, async () => true))
        )
      )
    );

  const seed = (
    id: string,
    createdAt: string,
    title?: string,
    image: string | null = null
  ): void => {
    store.commit(
      events.linkCreatedV2({
        id,
        url: `https://example.com/${id}`,
        domain: "example.com",
        source: "manual",
        sourceMeta: null,
        createdAt: new Date(createdAt),
      })
    );
    if (title) {
      store.commit(
        events.linkMetadataFetched({
          id: `snapshot-${id}`,
          linkId: id,
          title,
          description: null,
          image,
          favicon: null,
          fetchedAt: new Date(createdAt),
        })
      );
    }
  };

  it.effect("saves a link and its tags as one durable operation", () =>
    run(
      Effect.gen(function* () {
        const links = yield* WorkspaceLinks;
        const saved = yield* links.save({
          url: "https://example.com/article",
          tags: ["Reading", "distributed"],
          source: "api",
        });

        expect(saved.created).toBe(true);
        expect(saved.link.tags).toEqual(["reading", "distributed"]);

        const duplicate = yield* links.save({
          url: "https://example.com/article",
          tags: ["later"],
          source: "mcp",
        });
        expect(duplicate.created).toBe(false);
        expect(duplicate.link.id).toBe(saved.link.id);
        expect(duplicate.link.tags).toEqual([
          "reading",
          "distributed",
          "later",
        ]);
      })
    )
  );

  it.effect("uses the Effect clock for mutation timestamps", () =>
    run(
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2026-08-20T12:34:56.000Z"));
        const links = yield* WorkspaceLinks;
        const saved = yield* links.save({
          url: "https://example.com/effect-clock",
          source: "api",
        });

        expect(saved.link.createdAt).toBe("2026-08-20T12:34:56.000Z");
      })
    )
  );

  it.effect("does not commit after the workspace lifecycle is fenced", () =>
    Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const result = yield* Effect.result(
        links.save({
          url: "https://example.com/fenced",
          source: "api",
        })
      );
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "WorkspaceLinkUnavailableError" },
      });
      expect((yield* links.list({})).links).toEqual([]);
    }).pipe(
      Effect.provide(
        WorkspaceLinks.layer.pipe(
          Layer.provide(
            WorkspaceLinkRepositoryLive(
              store,
              async () => true,
              () => false
            )
          )
        )
      )
    )
  );

  it.effect("reports a failed durability confirmation", () => {
    let syncAttempts = 0;
    return Effect.gen(function* () {
      const links = yield* WorkspaceLinks;
      const result = yield* Effect.result(
        links.save({
          url: "https://example.com/not-durable",
          source: "api",
        })
      );

      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "WorkspaceLinkSyncError",
          operation: "saveLink",
        },
      });
      expect(syncAttempts).toBe(1);
    }).pipe(
      Effect.provide(
        WorkspaceLinks.layer.pipe(
          Layer.provide(
            WorkspaceLinkRepositoryLive(store, async () => {
              syncAttempts += 1;
              return false;
            })
          )
        )
      )
    );
  });

  it.effect("lists recent links with stable cursors and date filters", () =>
    run(
      Effect.gen(function* () {
        seed("a", "2026-01-01T00:00:00Z");
        seed("b", "2026-02-01T00:00:00Z");
        seed("c", "2026-03-01T00:00:00Z");
        const links = yield* WorkspaceLinks;

        const first = yield* links.list({ state: "all", limit: 2 });
        expect(first.links.map((link) => link.id)).toEqual(["c", "b"]);
        expect(first.total).toBe(3);
        expect(first.nextCursor).not.toBeNull();

        const second = yield* links.list({
          state: "all",
          limit: 2,
          cursor: first.nextCursor!,
        });
        expect(second.links.map((link) => link.id)).toEqual(["a"]);

        const oldest = yield* links.list({
          state: "all",
          limit: 5,
          sort: "oldest",
          createdAfter: "2026-01-15T00:00:00Z",
        });
        expect(oldest.links.map((link) => link.id)).toEqual(["b", "c"]);
      })
    )
  );

  it.effect("distinguishes active links from all links", () =>
    run(
      Effect.gen(function* () {
        seed("inbox", "2026-01-01T00:00:00Z");
        seed("archived", "2026-02-01T00:00:00Z");
        const links = yield* WorkspaceLinks;
        yield* links.update({
          id: "archived",
          changes: { state: "archive" },
        });

        expect(
          (yield* links.list({ state: "active" })).links.map((link) => link.id)
        ).toEqual(["inbox"]);
        expect(
          (yield* links.list({ state: "all" })).links.map((link) => link.id)
        ).toEqual(["inbox"]);
        expect(
          (yield* links.list({ state: "archive" })).links.map((link) => link.id)
        ).toEqual(["archived"]);
        expect(
          (yield* links.list({ state: "any" })).links.map((link) => link.id)
        ).toEqual(["archived", "inbox"]);
      })
    )
  );

  it.effect("rejects non-ISO and impossible date filters", () =>
    run(
      Effect.gen(function* () {
        const links = yield* WorkspaceLinks;
        for (const createdAfter of ["2026", "2026-02-30T00:00:00Z"]) {
          const result = yield* Effect.result(links.list({ createdAfter }));
          expect(result).toMatchObject({
            _tag: "Failure",
            failure: { _tag: "WorkspaceLinkInvalidInputError" },
          });
        }
      })
    )
  );

  it.effect("searches enriched fields and returns candidate context", () =>
    run(
      Effect.gen(function* () {
        seed(
          "photo",
          "2026-02-01T00:00:00Z",
          "Red bicycle gallery",
          "https://example.com/bicycle.jpg"
        );
        seed("other", "2026-03-01T00:00:00Z", "Unrelated article");
        const links = yield* WorkspaceLinks;

        const results = yield* links.search({
          query: "bicycle",
          createdAfter: "2026-01-01T00:00:00Z",
          createdBefore: "2026-03-01T00:00:00Z",
        });

        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
          id: "photo",
          image: "https://example.com/bicycle.jpg",
          matchedFields: ["title"],
        });
      })
    )
  );

  it.effect("searches for any word by default and ranks broader matches", () =>
    run(
      Effect.gen(function* () {
        seed("both", "2026-01-01T00:00:00Z", "Education course guide");
        seed("one", "2026-02-01T00:00:00Z", "Education journal");
        seed("neither", "2026-03-01T00:00:00Z", "Gardening notes");
        const links = yield* WorkspaceLinks;

        const any = yield* links.search({ query: "education course" });
        expect(any.map((link) => link.id)).toEqual(["both", "one"]);

        const all = yield* links.search({
          query: "education course",
          match: "all",
        });
        expect(all.map((link) => link.id)).toEqual(["both"]);
      })
    )
  );

  it.effect(
    "updates one link and bounded filtered batches without reprocessing",
    () =>
      run(
        Effect.gen(function* () {
          seed("old-a", "2025-01-01T00:00:00Z");
          seed("old-b", "2025-02-01T00:00:00Z");
          seed("new", "2026-01-01T00:00:00Z");
          const links = yield* WorkspaceLinks;

          const one = yield* links.update({
            id: "new",
            changes: { tags: { set: ["keep"] } },
          });
          expect(one.tags).toEqual(["keep"]);

          const batch = yield* links.updateMany({
            where: { createdBefore: "2025-12-31T00:00:00Z" },
            changes: { state: "completed" },
            limit: 100,
          });
          expect(batch.updated).toBe(2);
          expect(batch.links.map((link) => link.state)).toEqual([
            "completed",
            "completed",
          ]);

          const untouched = yield* links.get("new");
          expect(untouched.state).toBe("inbox");
        })
      )
  );

  it.effect(
    "does not report success when a deleted tag cannot be attached",
    () =>
      run(
        Effect.gen(function* () {
          seed("link", "2026-01-01T00:00:00Z");
          store.commit(
            events.tagCreated({
              id: "removed",
              name: "removed",
              sortOrder: 1,
              createdAt: new Date("2026-01-01T00:00:00Z"),
            })
          );
          store.commit(
            events.tagDeleted({
              id: "removed",
              deletedAt: new Date("2026-01-02T00:00:00Z"),
            })
          );

          const links = yield* WorkspaceLinks;
          const result = yield* Effect.result(
            links.update({
              id: "link",
              changes: { tags: { add: ["removed"] } },
            })
          );
          expect(result).toMatchObject({
            _tag: "Failure",
            failure: {
              _tag: "WorkspaceLinkInvalidInputError",
              message: 'Tag "removed" has been deleted',
            },
          });
        })
      )
  );

  it.effect("rejects an explicit batch atomically when any id is missing", () =>
    run(
      Effect.gen(function* () {
        seed("existing", "2026-01-01T00:00:00Z");
        const links = yield* WorkspaceLinks;
        const result = yield* Effect.result(
          links.updateMany({
            ids: ["existing", "missing"],
            changes: { state: "completed" },
          })
        );
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "WorkspaceLinkNotFoundError",
            linkId: "missing",
          },
        });
        expect((yield* links.get("existing")).state).toBe("inbox");
      })
    )
  );
});
