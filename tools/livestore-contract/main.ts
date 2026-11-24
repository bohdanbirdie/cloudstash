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
} from "effect";

import { contractDir, runContract } from "./src/contract";

class ContractFailed extends Data.TaggedError("ContractFailed") {
  override readonly [Runtime.errorReported] = false;
}

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* path.fromFileUrl(new URL("../../", import.meta.url));
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

  const report = yield* runContract({ root, baseRef });

  const lines = [
    `LiveStore contract, checked against ${report.base}`,
    ...report.updated.map(
      (file) =>
        `- UPDATED: ${file} was out of date and has been rewritten; review and commit it.`
    ),
    ...report.errors.map((line) => `- ERROR: ${line}`),
    ...report.breaks.map((line) => `- BREAK: ${line}`),
    ...report.notes.map((line) => `- note: ${line}`),
  ];
  const advice =
    report.breaks.length === 0
      ? []
      : [
          "",
          "This breaks events that are already deployed. Old events stay in every user's history and must keep loading the same way (CS.SYS.DATA-R05).",
          "Put the old event back as it was and add a new version instead (for example v1.TagRenamed -> v2.TagRenamed).",
          `Do not edit files in ${contractDir} to make this pass; they are checked against the base branch. If the break is deliberate, stop and ask the maintainer.`,
        ];
  const failed =
    report.updated.length > 0 ||
    report.errors.length > 0 ||
    report.breaks.length > 0;
  const verdict =
    report.updated.length > 0
      ? "Generated files were out of date."
      : report.errors.length > 0
        ? "The contract has errors."
        : report.breaks.length > 0
          ? `${report.breaks.length} breaking change(s) to deployed events.`
          : "The contract holds.";

  yield* Console.log([...lines, ...advice, "", verdict].join("\n"));

  if (Option.isSome(stepSummary)) {
    yield* fs.writeFileString(
      stepSummary.value,
      [
        "## LiveStore contract",
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
      `breaking=${report.breaks.length > 0}\n`,
      { flag: "a" }
    );
  }

  const onlyBreaksInCi =
    inCi && report.updated.length === 0 && report.errors.length === 0;
  if (failed && !onlyBreaksInCi) return yield* new ContractFailed();
});

BunRuntime.runMain(program.pipe(Effect.provide(BunServices.layer)));
