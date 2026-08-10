import { readFileSync } from "node:fs";

import { Schema } from "@livestore/livestore";
import { describe, expect, it } from "vitest";

import { events } from "../schema";

const FixtureSchema = Schema.Struct({
  $provenance: Schema.String,
  realRows: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      args: Schema.String,
      seqNum: Schema.Number,
      parentSeqNum: Schema.Number,
      createdAt: Schema.String,
      clientId: Schema.String,
      sessionId: Schema.String,
    })
  ),
  synthetic: Schema.Array(
    Schema.Struct({
      event: Schema.String,
      variant: Schema.String,
      args: Schema.Record(Schema.String, Schema.Unknown),
      encodedV3: Schema.String,
    })
  ),
});

const fixture = Schema.decodeUnknownSync(FixtureSchema)(
  JSON.parse(
    readFileSync(
      new URL("./fixtures/event-wire-goldens.json", import.meta.url),
      "utf8"
    )
  )
);

const defs = new Map<string, (typeof events)[keyof typeof events]>();
for (const def of Object.values(events)) {
  defs.set(def.name, def);
}

const defFor = (name: string) => {
  const def = defs.get(name);
  if (def === undefined) {
    throw new Error(`Fixture references unknown event: ${name}`);
  }
  return def;
};

const reviveValue = (value: unknown) => {
  if (
    typeof value === "object" &&
    value !== null &&
    "$date" in value &&
    typeof value.$date === "string"
  ) {
    return new Date(value.$date);
  }
  return value;
};

const reviveArgs = (args: { readonly [key: string]: unknown }) =>
  Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, reviveValue(value)])
  );

describe("event wire format vs v3 goldens (fixtures/event-wire-goldens.json, provenance in $provenance)", () => {
  it("covers every event type with at least one synthetic golden", () => {
    const covered = new Set(fixture.synthetic.map((golden) => golden.event));
    const allNames = [...defs.keys()].toSorted();
    const missing = allNames.filter((name) => !covered.has(name));
    expect(missing).toEqual([]);
  });

  describe("synthetic goldens (encoded by effect v3)", () => {
    for (const golden of fixture.synthetic) {
      describe(`${golden.event} (${golden.variant})`, () => {
        it("decodes the v3 wire form to the canonical instance", () => {
          const def = defFor(golden.event);
          const decoded = Schema.decodeUnknownSync(def.schema)(
            JSON.parse(golden.encodedV3)
          );
          expect(decoded).toEqual(reviveArgs(golden.args));
        });

        it("encodes the canonical instance byte-identically to the v3 wire form", () => {
          const def = defFor(golden.event);
          const encoded = Schema.encodeUnknownSync(def.schema)(
            reviveArgs(golden.args)
          );
          expect(JSON.stringify(encoded)).toBe(golden.encodedV3);
        });
      });
    }
  });

  describe("real production eventlog rows (fork/v3-written)", () => {
    for (const row of fixture.realRows) {
      it(`${row.name} seqNum ${row.seqNum} round-trips byte-identically`, () => {
        const def = defFor(row.name);
        const decoded = Schema.decodeUnknownSync(def.schema)(
          JSON.parse(row.args)
        );
        const reEncoded = Schema.encodeUnknownSync(def.schema)(decoded);
        expect(JSON.stringify(reEncoded)).toBe(row.args);
      });
    }

    it("decodes the first production v2.LinkCreated row field-by-field", () => {
      const row = fixture.realRows.find(
        (candidate) => candidate.name === "v2.LinkCreated"
      );
      if (row === undefined) {
        throw new Error("Fixture is missing the v2.LinkCreated real row");
      }
      const decoded = Schema.decodeUnknownSync(events.linkCreatedV2.schema)(
        JSON.parse(row.args)
      );
      expect(decoded).toEqual({
        createdAt: new Date("2026-06-24T12:45:27.136Z"),
        domain: "www.typeonce.dev",
        id: "941ff392-4dd3-4e02-bb2c-a1d4bc4c6428",
        source: "app",
        sourceMeta: null,
        url: "https://www.typeonce.dev/course/effect-beginners-complete-getting-started",
      });
    });
  });
});
