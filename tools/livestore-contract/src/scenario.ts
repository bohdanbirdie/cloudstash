import { makeInMemoryAdapter } from "@livestore/adapter-web";
import { createStorePromise } from "@livestore/livestore";
import type { LiveStoreEvent } from "@livestore/livestore";
import { Data, Effect, Schema } from "effect";

import { schema, tables } from "../../../src/livestore/schema";
import { byCodeUnit, canonicalJson, JsonObject, sortKeys } from "./json";

const Tables = Schema.Record(Schema.String, Schema.Array(JsonObject));
type Tables = typeof Tables.Type;

const Step = Schema.Struct({
  event: Schema.String,
  args: JsonObject,
  expect: Schema.optionalKey(Tables),
});

/**
 * A story of events in their wire form. `expect` lists, after each step, every
 * table that step changed with all of that table's rows; `bun run contract`
 * records it.
 */
export const Scenario = Schema.Struct({
  about: Schema.String,
  steps: Schema.Array(Step),
});
export type Scenario = typeof Scenario.Type;

export const formatScenario = (scenario: Scenario) =>
  `${JSON.stringify(
    {
      about: scenario.about,
      steps: scenario.steps.map((step) => ({
        event: step.event,
        args: sortKeys(step.args),
        expect: step.expect ?? {},
      })),
    },
    null,
    2
  )}\n`;

export class StepFailed extends Data.TaggedError("StepFailed")<{
  readonly step: number;
  readonly event: string;
  readonly reason: string;
}> {}

const stateTables = Object.values(tables)
  .map((table) => table.sqliteDef)
  .toSorted((a, b) => byCodeUnit(a.name, b.name));

const selectAll = (table: (typeof stateTables)[number]) => {
  const keys = Object.entries(table.columns)
    .filter(([, column]) => column.primaryKey)
    .map(([name]) => `"${name}"`);
  return `SELECT * FROM "${table.name}" ORDER BY ${keys.length > 0 ? keys.join(", ") : "rowid"}`;
};

const openStore = Effect.acquireRelease(
  Effect.promise(() =>
    createStorePromise({
      adapter: makeInMemoryAdapter(),
      schema,
      storeId: "livestore-contract",
      disableDevtools: true,
      logLevel: "None",
    })
  ),
  (store) => Effect.promise(() => store.shutdownPromise())
);

/**
 * Play a scenario on an empty store with this code's events and materializers
 * and return it with `expect` recorded. Fails on the first step whose args no
 * longer decode, re-encode differently, or whose materializer throws.
 */
export const play = Effect.fn("play")(function* (scenario: Scenario) {
  const store = yield* openStore;
  const readTables = Effect.forEach(stateTables, (table) =>
    Schema.decodeUnknownEffect(Schema.Array(JsonObject))(
      store.query({ query: selectAll(table), bindValues: {} })
    ).pipe(Effect.map((rows) => [table.name, rows] as const))
  ).pipe(
    Effect.map(Object.fromEntries<ReadonlyArray<JsonObject>>),
    Effect.orDie
  );

  let previous: Tables = yield* readTables;
  const steps: Array<typeof Step.Type> = [];
  for (const [index, step] of scenario.steps.entries()) {
    const failed = (reason: string) =>
      new StepFailed({ step: index + 1, event: step.event, reason });
    const def = schema.eventsDefsMap.get(step.event);
    if (def === undefined) return yield* failed("there is no such event");
    const args = yield* Schema.decodeUnknownEffect(def.schema)(step.args).pipe(
      Effect.mapError((error) =>
        failed(`its args no longer decode: ${error.message}`)
      )
    );
    const encoded = yield* Schema.encodeUnknownEffect(def.schema)(args).pipe(
      Effect.mapError((error) =>
        failed(`its args no longer encode: ${error.message}`)
      )
    );
    if (canonicalJson(encoded) !== canonicalJson(step.args)) {
      return yield* failed(
        `its args re-encode as ${canonicalJson(encoded)} instead of ${canonicalJson(step.args)}`
      );
    }
    yield* Effect.try({
      try: () =>
        store.commit({
          name: def.name,
          args,
        } as LiveStoreEvent.Input.ForSchema<typeof schema>),
      catch: (error) => failed(`its materializer failed: ${String(error)}`),
    });
    const current = yield* readTables;
    steps.push({
      event: step.event,
      args: step.args,
      expect: Object.fromEntries(
        Object.entries(current).filter(
          ([table, rows]) =>
            canonicalJson(rows) !== canonicalJson(previous[table])
        )
      ),
    });
    previous = current;
  }
  return { about: scenario.about, steps };
}, Effect.scoped);

/**
 * The first step where playing a recorded scenario on this code gives
 * different tables than the recording.
 */
export const firstDifference = (recorded: Scenario, played: Scenario) => {
  for (const [index, step] of recorded.steps.entries()) {
    const expected = step.expect ?? {};
    const actual = played.steps[index]?.expect ?? {};
    const tableNames = [
      ...new Set([...Object.keys(expected), ...Object.keys(actual)]),
    ].toSorted(byCodeUnit);
    const differing = tableNames.filter(
      (table) => canonicalJson(expected[table]) !== canonicalJson(actual[table])
    );
    if (differing.length === 0) continue;
    return `step ${index + 1} (${step.event}) changes ${differing
      .map(
        (table) =>
          `${table} to ${canonicalJson(actual[table] ?? "nothing")} instead of ${canonicalJson(expected[table] ?? "nothing")}`
      )
      .join("; ")}`;
  }
  return undefined;
};
