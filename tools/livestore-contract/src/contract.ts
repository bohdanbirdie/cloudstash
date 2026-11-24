import { Effect, FileSystem, Option, Path, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import { schema } from "../../../src/livestore/schema";
import { byCodeUnit, formatJson } from "./json";
import {
  firstDifference,
  formatScenario,
  play,
  Scenario,
  StepFailed,
} from "./scenario";
import { buildSnapshot, compareSnapshots, SchemaSnapshot } from "./snapshot";

export const contractDir = "tools/livestore-contract";
const snapshotFile = `${contractDir}/schema.json`;
const scenariosDir = `${contractDir}/scenarios`;

export interface ContractReport {
  readonly base: string;
  /** Generated files that were out of date and have been rewritten. */
  readonly updated: ReadonlyArray<string>;
  /** Problems in this tree: always fail. */
  readonly errors: ReadonlyArray<string>;
  /** Breaks against the base branch: fail unless a person approves. */
  readonly breaks: ReadonlyArray<string>;
  readonly notes: ReadonlyArray<string>;
}

const describeStepFailure = (file: string, failure: StepFailed) =>
  `${file} step ${failure.step} (${failure.event}): ${failure.reason}`;

/**
 * Update the generated files in this tree, then check this code against the
 * schema snapshot and scenarios committed on the base commit.
 */
export const runContract = Effect.fn("runContract")(function* (options: {
  readonly root: string;
  readonly baseRef: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const git = (args: ReadonlyArray<string>) =>
    spawner.string(ChildProcess.make("git", args, { cwd: options.root }));

  const updated: string[] = [];
  const errors: string[] = [];
  const breaks: string[] = [];
  const notes: string[] = [];

  const writeGenerated = Effect.fn("writeGenerated")(function* (
    file: string,
    content: string
  ) {
    const absolute = path.join(options.root, file);
    const current = yield* fs
      .readFileString(absolute)
      .pipe(
        Effect.catchReason("PlatformError", "NotFound", () =>
          Effect.succeed("")
        )
      );
    if (current === content) return;
    yield* fs.writeFileString(absolute, content);
    updated.push(file);
  });

  const head = buildSnapshot();
  yield* writeGenerated(snapshotFile, formatJson(head));

  const scenarioFiles = (yield* fs.readDirectory(
    path.join(options.root, scenariosDir)
  ))
    .filter((name) => name.endsWith(".json"))
    .toSorted(byCodeUnit);
  const covered = new Set<string>();
  for (const name of scenarioFiles) {
    const file = `${scenariosDir}/${name}`;
    const scenario = yield* fs
      .readFileString(path.join(options.root, file))
      .pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(Schema.fromJsonString(Scenario))
        )
      );
    for (const step of scenario.steps) covered.add(step.event);
    const recorded = yield* Effect.all([play(scenario), play(scenario)]).pipe(
      Effect.map(([first, second]) => {
        if (formatScenario(first) !== formatScenario(second)) {
          errors.push(
            `${file}: playing it twice gave different tables; a materializer is not deterministic`
          );
        }
        return Option.some(first);
      }),
      Effect.catchTag("StepFailed", (failure) => {
        errors.push(describeStepFailure(file, failure));
        return Effect.succeedNone;
      })
    );
    if (Option.isSome(recorded)) {
      yield* writeGenerated(file, formatScenario(recorded.value));
    }
  }

  const uncovered = [...schema.eventsDefsMap.keys()]
    .filter((name) => !covered.has(name))
    .toSorted(byCodeUnit);
  for (const name of uncovered) {
    errors.push(
      `${name} appears in no scenario: add a step for it to a file in ${scenariosDir}`
    );
  }

  const baseCommit = (yield* git([
    "rev-parse",
    "--verify",
    "--quiet",
    `${options.baseRef}^{commit}`,
  ])).trim();
  if (baseCommit === "") {
    errors.push(
      `Cannot resolve the base ${options.baseRef}; fetch it first (git fetch origin staging)`
    );
    return { base: options.baseRef, updated, errors, breaks, notes };
  }
  const base = `${options.baseRef} (${baseCommit.slice(0, 9)})`;

  const hasBaseSnapshot =
    (yield* spawner.exitCode(
      ChildProcess.make(
        "git",
        ["cat-file", "-e", `${baseCommit}:${snapshotFile}`],
        {
          cwd: options.root,
        }
      )
    )) === 0;
  if (!hasBaseSnapshot) {
    notes.push(
      `${options.baseRef} has no ${snapshotFile} yet, so there is nothing to compare against. Pull requests after this one are checked against the files this one commits.`
    );
    return { base, updated, errors, breaks, notes };
  }

  const baseSnapshot = yield* git([
    "show",
    `${baseCommit}:${snapshotFile}`,
  ]).pipe(
    Effect.flatMap(
      Schema.decodeUnknownEffect(Schema.fromJsonString(SchemaSnapshot))
    )
  );
  const comparison = compareSnapshots(baseSnapshot, head);
  breaks.push(...comparison.breaks);
  notes.push(...comparison.notes);

  const baseScenarioFiles = (yield* git([
    "ls-tree",
    "--name-only",
    baseCommit,
    "--",
    `${scenariosDir}/`,
  ]))
    .split("\n")
    .filter((file) => file.endsWith(".json"))
    .toSorted(byCodeUnit);
  for (const file of baseScenarioFiles) {
    const recorded = yield* git(["show", `${baseCommit}:${file}`]).pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.fromJsonString(Scenario))
      )
    );
    const problem = yield* play(recorded).pipe(
      Effect.map((played) => firstDifference(recorded, played)),
      Effect.map((difference) =>
        difference === undefined ? undefined : `${file} ${difference}`
      ),
      Effect.catchTag("StepFailed", (failure) =>
        Effect.succeed(describeStepFailure(file, failure))
      )
    );
    if (problem !== undefined) breaks.push(problem);
  }
  notes.push(
    `Replayed ${baseScenarioFiles.length} scenarios from ${options.baseRef} on this code.`
  );

  return { base, updated, errors, breaks, notes };
});
