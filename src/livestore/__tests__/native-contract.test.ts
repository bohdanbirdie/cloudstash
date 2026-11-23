// @vitest-environment jsdom
// The LiveStore contract between the web app and the native app (apps/native): every table's
// columns, and what the web's materializers write for a run of events in their wire form. The
// native app's `cargo test` replays the same events through its own schema and must write the
// same rows. Change the web schema, then run `bun run contract:livestore:update` and
// `cargo test` in apps/native.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Schema } from "@livestore/livestore";
import { describe, expect, it } from "vitest";

import { events, tables } from "../schema";
import { makeTestStore } from "./test-helpers";
import type { TestStore } from "./test-helpers";

const FIXTURES = join(process.cwd(), "src/livestore/__tests__/fixtures");
const CONTRACT = join(FIXTURES, "native-contract.json");
const GOLDENS = join(FIXTURES, "event-wire-goldens.json");

type Def = (typeof events)[keyof typeof events];
const defs = new Map<string, Def>(
  Object.values(events).map((def) => [def.name, def])
);
const def = (name: string): Def => {
  const found = defs.get(name);
  if (found === undefined) {
    throw new Error(`Unknown event: ${name}`);
  }
  return found;
};

const at = (day: number) => new Date(Date.UTC(2026, 0, day, 9, 30));

/** Related events, in order, so updates and deletes land on rows that exist. */
const scenario: [string, Record<string, unknown>][] = [
  [
    "v2.LinkCreated",
    {
      createdAt: at(1),
      domain: "example.com",
      id: "link-a",
      source: "app",
      sourceMeta: null,
      url: "https://example.com/a",
    },
  ],
  [
    "v1.LinkCreated",
    {
      createdAt: at(2),
      domain: "example.org",
      id: "link-b",
      url: "https://example.org/b",
    },
  ],
  [
    "v1.LinkCreated",
    {
      createdAt: at(3),
      domain: "example.com",
      id: "link-dup",
      url: "https://example.com/a",
    },
  ],
  [
    "v1.LinkMetadataFetched",
    {
      description: "A page about canvas rendering",
      favicon: "https://example.com/favicon.ico",
      fetchedAt: at(4),
      id: "snap-a",
      image: "https://example.com/a.png",
      linkId: "link-a",
      title: "Canvas notes",
    },
  ],
  [
    "v1.LinkMetadataFetched",
    {
      description: null,
      favicon: null,
      fetchedAt: at(5),
      id: "snap-b",
      image: null,
      linkId: "link-b",
      title: null,
    },
  ],
  [
    "v1.LinkSummarized",
    {
      id: "sum-a",
      linkId: "link-a",
      model: "test-model",
      summarizedAt: at(6),
      summary: "A summary.\nOn two lines.",
    },
  ],
  [
    "v1.TagCreated",
    { createdAt: at(7), id: "tag-1", name: "design", sortOrder: 1 },
  ],
  [
    "v1.TagCreated",
    { createdAt: at(8), id: "tag-2", name: "rust", sortOrder: 2 },
  ],
  ["v1.TagRenamed", { id: "tag-2", name: "systems" }],
  ["v1.TagReordered", { id: "tag-2", sortOrder: 0 }],
  [
    "v1.LinkTagged",
    { createdAt: at(9), id: "lt-1", linkId: "link-a", tagId: "tag-1" },
  ],
  [
    "v1.LinkTagged",
    { createdAt: at(10), id: "lt-2", linkId: "link-a", tagId: "tag-2" },
  ],
  [
    "v1.LinkTagged",
    { createdAt: at(11), id: "lt-3", linkId: "link-b", tagId: "tag-1" },
  ],
  [
    "v1.LinkTagged",
    { createdAt: at(12), id: "lt-dup", linkId: "link-a", tagId: "tag-1" },
  ],
  ["v1.LinkUntagged", { id: "lt-3" }],
  ["v2.LinkUntagged", { linkId: "link-a", tagId: "tag-2" }],
  ["v1.TagDeleted", { deletedAt: at(13), id: "tag-1" }],
  ["v1.LinkCompleted", { completedAt: at(14), id: "link-a" }],
  ["v1.LinkUncompleted", { id: "link-a" }],
  ["v1.LinkCompleted", { completedAt: at(15), id: "link-b" }],
  ["v1.LinkDeleted", { deletedAt: at(16), id: "link-b" }],
  ["v1.LinkRestored", { id: "link-b" }],
];

/** Then one of every event, from the wire goldens, so a new event can't go unnoticed. */
const goldens = (): [string, Record<string, unknown>][] => {
  const fixture = JSON.parse(readFileSync(GOLDENS, "utf8")) as {
    synthetic: { event: string; encodedV3: string }[];
  };
  return fixture.synthetic.map((g) => [
    g.event,
    Schema.decodeUnknownSync(def(g.event).schema)(
      JSON.parse(g.encodedV3)
    ) as Record<string, unknown>,
  ]);
};

const stateTables = Object.values(tables).map((t) => t.sqliteDef);

const rows = (store: TestStore, table: (typeof stateTables)[number]) => {
  const keys = Object.entries(table.columns)
    .filter(([, c]) => c.primaryKey)
    .map(([name]) => `"${name}"`);
  const order = keys.length > 0 ? keys.join(", ") : "rowid";
  return store.query({
    query: `SELECT * FROM "${table.name}" ORDER BY ${order}`,
    bindValues: {},
  }) as Record<string, unknown>[];
};

const build = async () => {
  const store = await makeTestStore();
  try {
    const columns = Object.fromEntries(
      stateTables.map((t) => [
        t.name,
        Object.fromEntries(
          Object.entries(t.columns).map(([name, c]) => [
            name,
            {
              type: c.columnType,
              nullable: c.nullable,
              primaryKey: c.primaryKey,
              ...(c.default._tag === "Some"
                ? { default: c.default.value }
                : {}),
            },
          ])
        ),
      ])
    );
    let last = Object.fromEntries(
      stateTables.map((t) => [t.name, JSON.stringify(rows(store, t))])
    );
    const steps = [...scenario, ...goldens()].map(([name, args]) => {
      const d = def(name);
      const wire = Schema.encodeUnknownSync(d.schema)(args);
      store.commit(
        (d as unknown as (a: unknown) => Parameters<TestStore["commit"]>[0])(
          args
        )
      );
      const changes: Record<string, unknown> = {};
      for (const t of stateTables) {
        const now = rows(store, t);
        if (JSON.stringify(now) !== last[t.name]) {
          changes[t.name] = now;
          last[t.name] = JSON.stringify(now);
        }
      }
      return { event: name, args: wire, changes };
    });
    return {
      $about:
        "Generated by src/livestore/__tests__/native-contract.test.ts from src/livestore/schema.ts; do not edit. apps/native replays steps and must write the same rows.",
      tables: columns,
      steps,
    };
  } finally {
    await store.shutdownPromise?.();
  }
};

describe("native LiveStore contract (fixtures/native-contract.json)", () => {
  let built: Awaited<ReturnType<typeof build>> | undefined;

  it("matches what the web schema writes", async () => {
    built = await build();
    if (process.env.UPDATE_NATIVE_CONTRACT) {
      writeFileSync(CONTRACT, `${JSON.stringify(built, null, 2)}\n`);
    }
    const committed: unknown = JSON.parse(readFileSync(CONTRACT, "utf8"));
    expect(
      committed,
      "the web schema changed: run `bun run contract:livestore:update`, then `cargo test` in apps/native"
    ).toEqual(built);
  });

  it("replays every event at least once", async () => {
    built ??= await build();
    const replayed = new Set(built.steps.map((s) => s.event));
    expect([...defs.keys()].filter((name) => !replayed.has(name))).toEqual([]);
  });
});
