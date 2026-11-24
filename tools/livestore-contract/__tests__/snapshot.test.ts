import { BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path } from "effect";

import { formatJson } from "../src/json";
import { buildSnapshot, compareSnapshots } from "../src/snapshot";
import type { SchemaSnapshot } from "../src/snapshot";

const base = buildSnapshot();

const tagRenamed = base.events["v1.TagRenamed"];
if (tagRenamed === undefined) throw new Error("v1.TagRenamed is missing");

const withEvents = (events: SchemaSnapshot["events"]): SchemaSnapshot => ({
  ...base,
  events,
});

const withoutEvent = (name: string) =>
  Object.fromEntries(
    Object.entries(base.events).filter(([eventName]) => eventName !== name)
  );

const withTagRenamedArgs = (args: Record<string, unknown>) =>
  withEvents({ ...base.events, "v1.TagRenamed": { ...tagRenamed, args } });

const tagRenamedFields = {
  id: { type: "string" },
  name: { type: "string" },
};

describe("schema.json", () => {
  it.effect("matches src/livestore/schema.ts", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const file = yield* path.fromFileUrl(
        new URL("../schema.json", import.meta.url)
      );
      expect(yield* fs.readFileString(file)).toBe(formatJson(buildSnapshot()));
    }).pipe(Effect.provide(BunServices.layer))
  );
});

describe("compareSnapshots", () => {
  it("passes an unchanged manifest", () => {
    expect(compareSnapshots(base, buildSnapshot())).toEqual({
      breaks: [],
      notes: [],
    });
  });

  it("fails a removed event", () => {
    expect(
      compareSnapshots(base, withEvents(withoutEvent("v1.TagRenamed"))).breaks
    ).toEqual([
      "v1.TagRenamed was removed; old events of this type would be skipped on every rebuild",
    ]);
  });

  it("fails a renamed event and names the likely new name", () => {
    const head = withEvents({
      ...withoutEvent("v1.TagRenamed"),
      "v1.TagNameChanged": tagRenamed,
    });
    expect(compareSnapshots(base, head).breaks).toEqual([
      "v1.TagRenamed was renamed to v1.TagNameChanged; old events still carry the old name",
    ]);
  });

  it("fails a changed scope", () => {
    const head = withEvents({
      ...base.events,
      "v1.TagRenamed": { ...tagRenamed, scope: "clientOnly" },
    });
    expect(compareSnapshots(base, head).breaks).toEqual([
      "v1.TagRenamed: scope changed from synced to clientOnly",
    ]);
  });

  it("fails a new required field", () => {
    const head = withTagRenamedArgs({
      ...tagRenamed.args,
      properties: { ...tagRenamedFields, renamedBy: { type: "string" } },
      required: ["id", "name", "renamedBy"],
    });
    expect(compareSnapshots(base, head).breaks).toEqual([
      "v1.TagRenamed: new required field `renamedBy`, so old events without it no longer decode",
    ]);
  });

  it("fails a removed field", () => {
    const head = withTagRenamedArgs({
      ...tagRenamed.args,
      properties: { id: { type: "string" } },
      required: ["id"],
    });
    expect(compareSnapshots(base, head).breaks).toEqual([
      "v1.TagRenamed: field `name` was removed",
    ]);
  });

  it("fails a changed or tightened type", () => {
    const head = withTagRenamedArgs({
      ...tagRenamed.args,
      properties: {
        ...tagRenamedFields,
        name: { type: "string", minLength: 1 },
      },
    });
    expect(compareSnapshots(base, head).breaks).toEqual([
      'v1.TagRenamed: field `name` changed type from {"type":"string"} to {"minLength":1,"type":"string"}',
    ]);
  });

  it("fails a field that keeps its wire shape but decodes differently", () => {
    const linkCreated = base.events["v2.LinkCreated"];
    if (linkCreated === undefined) throw new Error("v2.LinkCreated is missing");
    const head = withEvents({
      ...base.events,
      "v2.LinkCreated": {
        ...linkCreated,
        decoded: { ...linkCreated.decoded, source: { _tag: "Literal" } },
      },
    });
    expect(compareSnapshots(base, head).breaks).toEqual([
      'v2.LinkCreated: field `source` keeps its wire shape but decodes differently, from {"_tag":"String","checks":[]} to {"_tag":"Literal"}, so old events may no longer decode',
    ]);
  });

  it("fails a required field that became optional", () => {
    const head = withTagRenamedArgs({ ...tagRenamed.args, required: ["id"] });
    expect(compareSnapshots(base, head).breaks).toEqual([
      "v1.TagRenamed: field `name` became optional, so clients that still require it reject new events",
    ]);
  });

  it("passes a new optional field and a new event", () => {
    const head = withEvents({
      ...base.events,
      "v1.TagRenamed": {
        ...tagRenamed,
        args: {
          ...tagRenamed.args,
          properties: { ...tagRenamedFields, renamedBy: { type: "string" } },
        },
      },
      "v2.TagRenamed": tagRenamed,
    });
    expect(compareSnapshots(base, head)).toEqual({
      breaks: [],
      notes: [
        "v1.TagRenamed: new optional field `renamedBy`",
        "v2.TagRenamed: new event",
      ],
    });
  });

  it("reports a table change without failing", () => {
    const head: SchemaSnapshot = {
      ...base,
      tables: { ...base.tables, tags: { columns: [], indexes: [] } },
    };
    expect(compareSnapshots(base, head)).toEqual({
      breaks: [],
      notes: [
        "Tables changed (tags): every replica, including each LinkProcessorDO, rebuilds its state from the eventlog after this deploys",
      ],
    });
  });
});
