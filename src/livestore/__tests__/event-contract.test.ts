import { BunServices } from "@effect/platform-bun";
import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Schema } from "effect";

import {
  buildManifest,
  compareManifests,
  encodeManifest,
  Goldens,
  goldensPath,
  manifestPath,
  replayGoldens,
} from "../contract/event-contract";
import type { Manifest } from "../contract/event-contract";

const base = buildManifest();

const tagRenamed = base.events["v1.TagRenamed"];
if (tagRenamed === undefined) throw new Error("v1.TagRenamed is missing");

const withEvents = (events: Manifest["events"]): Manifest => ({
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

describe("LiveStore event manifest", () => {
  it.effect("the committed manifest matches src/livestore/schema.ts", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* path.fromFileUrl(
        new URL("../../../", import.meta.url)
      );
      const committed = yield* fs.readFileString(path.join(root, manifestPath));
      expect(committed).toBe(encodeManifest(buildManifest()));
    }).pipe(Effect.provide(BunServices.layer))
  );

  it.effect("the committed goldens replay byte for byte", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* path.fromFileUrl(
        new URL("../../../", import.meta.url)
      );
      const goldens = yield* fs
        .readFileString(path.join(root, goldensPath))
        .pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(Schema.fromJsonString(Goldens))
          )
        );
      expect(replayGoldens(goldens)).toEqual([]);
    }).pipe(Effect.provide(BunServices.layer))
  );
});

describe("compareManifests", () => {
  it("passes an unchanged manifest", () => {
    expect(compareManifests(base, buildManifest())).toEqual({
      breaks: [],
      notes: [],
    });
  });

  it("fails a removed event", () => {
    expect(
      compareManifests(base, withEvents(withoutEvent("v1.TagRenamed"))).breaks
    ).toEqual([
      "v1.TagRenamed was removed; old events of this type would be skipped on every rebuild",
    ]);
  });

  it("fails a renamed event and names the likely new name", () => {
    const head = withEvents({
      ...withoutEvent("v1.TagRenamed"),
      "v1.TagNameChanged": tagRenamed,
    });
    expect(compareManifests(base, head).breaks).toEqual([
      "v1.TagRenamed was renamed to v1.TagNameChanged; old events still carry the old name",
    ]);
  });

  it("fails a changed scope", () => {
    const head = withEvents({
      ...base.events,
      "v1.TagRenamed": { ...tagRenamed, scope: "clientOnly" },
    });
    expect(compareManifests(base, head).breaks).toEqual([
      "v1.TagRenamed: scope changed from synced to clientOnly",
    ]);
  });

  it("fails a new required field", () => {
    const head = withTagRenamedArgs({
      ...tagRenamed.args,
      properties: { ...tagRenamedFields, renamedBy: { type: "string" } },
      required: ["id", "name", "renamedBy"],
    });
    expect(compareManifests(base, head).breaks).toEqual([
      "v1.TagRenamed: new required field `renamedBy`, so old events without it no longer decode",
    ]);
  });

  it("fails a removed field", () => {
    const head = withTagRenamedArgs({
      ...tagRenamed.args,
      properties: { id: { type: "string" } },
      required: ["id"],
    });
    expect(compareManifests(base, head).breaks).toEqual([
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
    expect(compareManifests(base, head).breaks).toEqual([
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
    expect(compareManifests(base, head).breaks).toEqual([
      'v2.LinkCreated: field `source` keeps its wire shape but decodes differently, from {"_tag":"String","checks":[]} to {"_tag":"Literal"}, so old events may no longer decode',
    ]);
  });

  it("fails a required field that became optional", () => {
    const head = withTagRenamedArgs({ ...tagRenamed.args, required: ["id"] });
    expect(compareManifests(base, head).breaks).toEqual([
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
    expect(compareManifests(base, head)).toEqual({
      breaks: [],
      notes: [
        "v1.TagRenamed: new optional field `renamedBy`",
        "v2.TagRenamed: new event",
      ],
    });
  });

  it("reports a table change without failing", () => {
    const head: Manifest = {
      ...base,
      tables: { ...base.tables, tags: { columns: [], indexes: [] } },
    };
    expect(compareManifests(base, head)).toEqual({
      breaks: [],
      notes: [
        "Tables changed (tags): every replica, including each LinkProcessorDO, rebuilds its state from the eventlog after this deploys",
      ],
    });
  });
});

describe("replayGoldens", () => {
  it("fails a golden that no longer round-trips", () => {
    const failures = replayGoldens({
      realRows: [],
      synthetic: [
        {
          event: "v1.TagRenamed",
          variant: "edited",
          encodedV3: '{"name":"Reading","id":"tag-1"}',
        },
        {
          event: "v1.TagGone",
          variant: "removed",
          encodedV3: '{"id":"tag-1"}',
        },
        {
          event: "v1.TagRenamed",
          variant: "missing field",
          encodedV3: '{"id":"tag-1"}',
        },
      ],
    });
    expect(failures).toHaveLength(3);
    expect(failures[0]).toBe(
      'v1.TagRenamed golden (edited) re-encodes differently: {"id":"tag-1","name":"Reading"} instead of {"name":"Reading","id":"tag-1"}. Keep field order, and give new defaulted fields encodingStrategy "omit"'
    );
    expect(failures[1]).toBe(
      "v1.TagGone golden (removed): no event named v1.TagGone"
    );
    expect(failures[2]).toMatch(
      /^v1\.TagRenamed golden \(missing field\) no longer decodes: /
    );
  });
});
