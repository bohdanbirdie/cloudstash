import { it } from "@effect/vitest";
import { Effect } from "effect";
import { TestClock } from "effect/testing";
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, vi } from "vitest";

import { makeTestStore } from "@/livestore/__tests__/test-helpers";
import type { TestStore } from "@/livestore/__tests__/test-helpers";
import { events } from "@/livestore/schema";

import { makeWorkspaceLinks } from "../service";
import type { WorkspaceLinks } from "../service";

describe("WorkspaceLinks", () => {
  let store: TestStore;

  beforeEach(async () => {
    store = await makeTestStore();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await store.shutdownPromise?.();
  });

  type RecordedEvent = {
    readonly name?: string;
    readonly args?: Record<string, unknown>;
  };

  const captureCommits = (
    beforeCommit?: (
      changes: readonly RecordedEvent[],
      commit: TestStore["commit"]
    ) => void
  ): RecordedEvent[] => {
    const committed: RecordedEvent[] = [];
    const commit = store.commit.bind(store);
    vi.spyOn(store, "commit").mockImplementation((...changes) => {
      const recorded = changes as RecordedEvent[];
      beforeCommit?.(recorded, commit);
      committed.push(...recorded);
      return commit(...changes);
    });
    return committed;
  };

  const runWithSync = <Value, Error>(
    program: (links: WorkspaceLinks) => Effect.Effect<Value, Error>,
    sync: NonNullable<Parameters<typeof makeWorkspaceLinks>[1]>["sync"]
  ) => program(makeWorkspaceLinks(store, { sync }));

  const run = <Value, Error>(
    program: (links: WorkspaceLinks) => Effect.Effect<Value, Error>
  ) => runWithSync(program, async () => true);

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

  it.effect("saves a link and durably finalizes its tags", () =>
    run((links) =>
      Effect.gen(function* () {
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

  it.effect("repairs an interrupted external save when it is retried", () =>
    Effect.gen(function* () {
      let syncCalls = 0;
      yield* runWithSync(
        (links) =>
          Effect.gen(function* () {
            const url = "https://example.com/interrupted";
            store.commit(
              events.linkCreatedV2({
                id: "interrupted",
                url,
                domain: "example.com",
                source: "api",
                sourceMeta: null,
                createdAt: new Date("2026-08-20T12:00:00Z"),
              })
            );

            const committed = captureCommits();

            const saved = yield* links.save({ url, source: "mcp" });

            expect(saved).toMatchObject({
              created: false,
              link: { id: "interrupted" },
            });
            expect(
              committed.find(
                (event) => event.name === "v1.LinkProcessingStarted"
              )?.args?.linkId
            ).toBe("interrupted");
          }),
        async () => {
          syncCalls += 1;
          return true;
        }
      );
      expect(syncCalls).toBeGreaterThanOrEqual(1);
    })
  );

  it.effect(
    "resolves a concurrent URL winner before tags and processing",
    () => {
      const url = "https://race.example.com/article";
      const winnerId = "concurrent-winner";
      let raced = false;
      const committed = captureCommits((changes, commit) => {
        const createsLink = changes.some(
          (change) => change.name === "v2.LinkCreated"
        );
        if (!raced && createsLink) {
          raced = true;
          commit(
            events.linkCreatedV2({
              id: winnerId,
              url,
              domain: "race.example.com",
              source: "app",
              sourceMeta: null,
              createdAt: new Date("2026-08-20T12:00:00Z"),
            })
          );
        }
      });

      return run((links) =>
        Effect.gen(function* () {
          const saved = yield* links.save({
            url,
            tags: ["winner"],
            source: "mcp",
          });

          expect(saved).toMatchObject({
            created: false,
            link: { id: winnerId, tags: ["winner"] },
          });
          const losingCreate = committed.find(
            (event) => event.name === "v2.LinkCreated"
          );
          const losingId = losingCreate?.args?.id;
          expect(losingId).toBeTypeOf("string");
          expect(losingId).not.toBe(winnerId);
          expect(
            committed.filter(
              (event) =>
                event.args?.linkId === losingId &&
                (event.name === "v1.LinkTagged" ||
                  event.name === "v1.LinkProcessingStarted")
            )
          ).toEqual([]);
          expect(
            committed.find((event) => event.name === "v1.LinkProcessingStarted")
              ?.args?.linkId
          ).toBe(winnerId);
        })
      );
    }
  );

  it.effect("uses the Effect clock for mutation timestamps", () =>
    run((links) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(Date.parse("2026-08-20T12:34:56.000Z"));
        const saved = yield* links.save({
          url: "https://example.com/effect-clock",
          source: "api",
        });

        expect(saved.link.createdAt).toBe("2026-08-20T12:34:56.000Z");
      })
    )
  );

  it.effect("does not commit after the workspace lifecycle is fenced", () => {
    const links = makeWorkspaceLinks(store, { canCommit: () => false });
    return Effect.gen(function* () {
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
    });
  });

  it.effect("reports a failed durability confirmation", () => {
    let syncAttempts = 0;
    const links = makeWorkspaceLinks(store, {
      sync: async () => {
        syncAttempts += 1;
        return false;
      },
    });
    return Effect.gen(function* () {
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
    });
  });

  it.effect("lists recent links with stable cursors and date filters", () =>
    run((links) =>
      Effect.gen(function* () {
        seed("a", "2026-01-01T00:00:00Z");
        seed("b", "2026-02-01T00:00:00Z");
        seed("c", "2026-03-01T00:00:00Z");
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
    run((links) =>
      Effect.gen(function* () {
        seed("inbox", "2026-01-01T00:00:00Z");
        seed("archived", "2026-02-01T00:00:00Z");
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
    run((links) =>
      Effect.gen(function* () {
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
    run((links) =>
      Effect.gen(function* () {
        seed(
          "photo",
          "2026-02-01T00:00:00Z",
          "Red bicycle gallery",
          "https://example.com/bicycle.jpg"
        );
        seed("other", "2026-03-01T00:00:00Z", "Unrelated article");
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
    run((links) =>
      Effect.gen(function* () {
        seed("both", "2026-01-01T00:00:00Z", "Education course guide");
        seed("one", "2026-02-01T00:00:00Z", "Education journal");
        seed("neither", "2026-03-01T00:00:00Z", "Gardening notes");
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
      run((links) =>
        Effect.gen(function* () {
          seed("old-a", "2025-01-01T00:00:00Z");
          seed("old-b", "2025-02-01T00:00:00Z");
          seed("new", "2026-01-01T00:00:00Z");
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
      run((links) =>
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

  it.effect("does not create a link when a requested tag is invalid", () =>
    run((links) =>
      Effect.gen(function* () {
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

        const result = yield* Effect.result(
          links.save({
            url: "https://example.com/not-created",
            tags: ["removed"],
            source: "api",
          })
        );

        expect(result).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "WorkspaceLinkInvalidInputError" },
        });
        expect((yield* links.list({})).links).toEqual([]);
      })
    )
  );

  it.effect("rejects an explicit batch atomically when any id is missing", () =>
    run((links) =>
      Effect.gen(function* () {
        seed("existing", "2026-01-01T00:00:00Z");
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

  it.effect("does not create tags when an update has no target links", () =>
    run((links) =>
      Effect.gen(function* () {
        const committed = captureCommits();

        const missing = yield* Effect.result(
          links.update({
            id: "missing",
            changes: { tags: { add: ["unused"] } },
          })
        );
        const emptyBatch = yield* links.updateMany({
          where: { createdBefore: "2020-01-01T00:00:00Z" },
          changes: { tags: { add: ["also-unused"] } },
        });

        expect(missing).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "WorkspaceLinkNotFoundError" },
        });
        expect(emptyBatch.updated).toBe(0);
        expect(
          committed.filter((event) => event.name === "v1.TagCreated")
        ).toEqual([]);
      })
    )
  );

  it.effect("rejects explicit IDs that exceed the requested limit", () =>
    run((links) =>
      Effect.gen(function* () {
        seed("first", "2026-01-01T00:00:00Z");
        seed("second", "2026-02-01T00:00:00Z");
        const result = yield* Effect.result(
          links.updateMany({
            ids: ["first", "second"],
            changes: { state: "completed" },
            limit: 1,
          })
        );

        expect(result).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "WorkspaceLinkInvalidInputError",
            message: "ids cannot contain more entries than limit",
          },
        });
        expect((yield* links.get("first")).state).toBe("inbox");
        expect((yield* links.get("second")).state).toBe("inbox");
      })
    )
  );

  it.effect(
    "creates a new batch tag once and attaches it to every link",
    () => {
      seed("first", "2026-01-01T00:00:00Z");
      seed("second", "2026-02-01T00:00:00Z");
      seed("third", "2026-03-01T00:00:00Z");
      const committed = captureCommits();

      return run((links) =>
        Effect.gen(function* () {
          const result = yield* links.updateMany({
            ids: ["first", "second", "third"],
            changes: { tags: { add: ["shared"] } },
          });

          expect(result.updated).toBe(3);
          expect(
            committed.filter((event) => event.name === "v1.TagCreated")
          ).toHaveLength(1);
          expect(
            committed.filter((event) => event.name === "v1.LinkTagged")
          ).toHaveLength(3);
        })
      );
    }
  );
});
