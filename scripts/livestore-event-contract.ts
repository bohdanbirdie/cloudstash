import { BunRuntime, BunServices } from "@effect/platform-bun";
import {
  Config,
  Console,
  Data,
  Effect,
  FileSystem,
  Option,
  Path,
  Runtime,
  Schema,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import {
  buildManifest,
  compareManifests,
  encodeManifest,
  Goldens,
  goldensPath,
  Manifest,
  manifestPath,
  replayGoldens,
} from "../src/livestore/contract/event-contract";

class StaleManifest extends Data.TaggedError("StaleManifest") {
  readonly [Runtime.errorReported] = false;
}

class BreakingEventChange extends Data.TaggedError("BreakingEventChange") {
  readonly [Runtime.errorReported] = false;
}

class MissingBaseRef extends Data.TaggedError("MissingBaseRef")<{
  readonly ref: string;
}> {
  readonly [Runtime.errorReported] = false;
}

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const root = yield* path.fromFileUrl(new URL("../", import.meta.url));

  const baseName = yield* Config.String("GITHUB_BASE_REF").pipe(
    Config.withDefault(""),
    Config.map((name) => name || "staging")
  );
  const baseRef = yield* Config.String("CONTRACT_BASE_REF").pipe(
    Config.withDefault(`origin/${baseName}`)
  );
  const stepSummary = yield* Config.option(
    Config.String("GITHUB_STEP_SUMMARY")
  );
  const githubOutput = yield* Config.option(Config.String("GITHUB_OUTPUT"));
  const inCi = Option.isSome(githubOutput);

  const git = (args: ReadonlyArray<string>) =>
    ChildProcess.make("git", args, { cwd: root });

  const head = buildManifest();
  const generated = encodeManifest(head);
  const manifestFile = path.join(root, manifestPath);
  const committed = yield* fs
    .readFileString(manifestFile)
    .pipe(
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(""))
    );
  const stale = committed !== generated;
  if (stale) yield* fs.writeFileString(manifestFile, generated);

  const baseCommit = (yield* spawner.string(
    git(["rev-parse", "--verify", "--quiet", `${baseRef}^{commit}`])
  )).trim();
  if (baseCommit === "") {
    yield* Console.error(
      `Cannot resolve the base branch ${baseRef}. Fetch it first: git fetch origin ${baseName}`
    );
    return yield* new MissingBaseRef({ ref: baseRef });
  }

  const readBase = Effect.fn("readBase")(function* (file: string) {
    const exists = yield* spawner.exitCode(
      git(["cat-file", "-e", `${baseCommit}:${file}`])
    );
    if (exists !== 0) return Option.none<string>();
    return Option.some(
      yield* spawner.string(git(["show", `${baseCommit}:${file}`]))
    );
  });

  const baseManifest = yield* readBase(manifestPath);
  const baseGoldens = yield* readBase(goldensPath);
  const notes: string[] = [];
  const breaks: string[] = [];

  if (Option.isSome(baseManifest)) {
    const base = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Manifest)
    )(baseManifest.value);
    const report = compareManifests(base, head);
    breaks.push(...report.breaks);
    notes.push(...report.notes);
  } else {
    notes.push(
      `No manifest baseline exists yet: ${baseRef} has no ${manifestPath}, so event names, scopes and shapes were not compared; only the base goldens were replayed. Every later pull request into ${baseName} is compared against the manifest this one commits.`
    );
  }

  if (Option.isSome(baseGoldens)) {
    const goldens = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(Goldens)
    )(baseGoldens.value);
    breaks.push(...replayGoldens(goldens));
    notes.push(
      `Replayed ${goldens.realRows.length + goldens.synthetic.length} goldens from ${baseRef} through this code.`
    );
  } else {
    notes.push(
      `${baseRef} has no ${goldensPath}, so no goldens were replayed.`
    );
  }

  const lines = [
    `LiveStore event contract against ${baseRef} (${baseCommit.slice(0, 9)})`,
    ...(stale
      ? [
          `- STALE: ${manifestPath} did not match src/livestore/schema.ts. It has been regenerated; review and commit it.`,
        ]
      : []),
    ...breaks.map((line) => `- BREAK: ${line}`),
    ...notes.map((line) => `- note: ${line}`),
  ];
  const advice =
    breaks.length === 0
      ? []
      : [
          "",
          "Deployed events are append-only (CS.SYS.DATA-R05): old events stay in every eventlog and must keep decoding.",
          "Put the deployed event back as it was and add a new event version instead (for example v1.TagRenamed -> v2.TagRenamed), keeping the old event and its materializer.",
          "Do not edit the manifest, the goldens, or the contract tooling to make this pass. If the break is deliberate, stop and ask the maintainer: only a person can approve it in CI.",
        ];
  const verdict = stale
    ? "The committed manifest was stale."
    : breaks.length > 0
      ? `${breaks.length} breaking change(s) to deployed events.`
      : "No breaking changes to deployed events.";

  yield* Console.log([...lines, ...advice, "", verdict].join("\n"));

  if (Option.isSome(stepSummary)) {
    yield* fs.writeFileString(
      stepSummary.value,
      [
        "## LiveStore event contract",
        "",
        "```",
        ...lines,
        "```",
        ...advice,
        "",
        `**${verdict}**`,
        "",
      ].join("\n"),
      { flag: "a" }
    );
  }
  if (Option.isSome(githubOutput)) {
    yield* fs.writeFileString(
      githubOutput.value,
      `breaking=${breaks.length > 0}\n`,
      { flag: "a" }
    );
  }

  if (stale) return yield* new StaleManifest();
  if (breaks.length > 0 && !inCi) return yield* new BreakingEventChange();
});

BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
