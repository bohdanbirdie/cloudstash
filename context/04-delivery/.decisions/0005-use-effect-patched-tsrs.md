# Use Effect-patched TSRS for CI typechecking

Status: accepted

## Context

CI separately ran the native TypeScript checker and the JavaScript Effect
diagnostics CLI. The latter rebuilds TypeScript programs while scanning the
project and dominates the quality lane. Faster CI must retain both TypeScript
errors and the selected Effect warning gates.

## Evidence and Argument

[`@effect/tsgo`](https://github.com/Effect-TS/tsgo) ships Effect-patched TSRS
binaries and supports direct execution without mutating installed compilers.
Version `0.73.2` supports TSRS `7.1.0-beta.tsrs3`. Pinning both avoids silently
selecting another compiler when the wrapper's supported versions change.

On the maintainer's Apple Silicon machine, a local run measured the previous
root typecheck at 2.26 seconds and the separate Effect scan at 99.60 seconds;
the combined TSRS check took 1.04 seconds. Oxlint reported 4.1 seconds with
tsgolint and 2.2 seconds with TSRS. These are local single-run measurements,
not GitHub runner timings. The complete replacement quality command passed,
including the Intent and migration checks, in 6.30 seconds. Temporary negative
probes confirmed that a TypeScript assignment error and an Effect global-fetch
warning each fail checking, and that Oxlint still detects an unhandled promise
through its type-aware rule.

The previous diagnostics CLI's strict flag fails warnings, not suggestions.
The replacement explicitly retains that exit-code policy and the existing
seven warning overrides. Its additional `unstableApiUsage` rule reports use of
the deliberately pinned Effect HTTP/RPC, telemetry, and test APIs; this new rule
is excluded rather than expanding the migration into application API changes.

## Options

| Option                                                      | Tradeoffs                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Keep separate native TypeScript and JavaScript Effect scans | Retains the old toolchain but repeats type analysis and the slow Effect pass        |
| Use upstream TSRS alone                                     | Fast native checking but loses Effect-specific diagnostics                          |
| Use Effect-patched TSRS                                     | Combines both gates, with a beta compiler and an additional upstream wrapper to pin |

## Decision

Use `effect-tsgo tsrs@7.1.0-beta.tsrs3` from exact-pinned `@effect/tsgo@0.73.2`
for the root and extension typechecks. Do not enable TSRS's opt-in `--fast`
semantic deviations. Run the combined root check once in the quality job and
leave the unit job responsible for tests. Keep `check:effect` as a compatibility
alias, not a second CI pass. Keep TypeScript 6 and its JavaScript Effect editor
plugin for existing editor consumers; neither executes the CI diagnostics pass.

Run Vite+ check/fix and staged checks through
`effect-tsgo --tsrs-lint=7.1.0-beta.tsrs3 vp` so Oxlint's type-aware rules use
TSRS instead of tsgolint. The wrapper supports the Oxlint `1.93.0` version
resolved by Vite+ `1.6.0`; no Vite+ upgrade or lint-rule policy change is needed.
Upstream marks this alternate type-aware backend experimental, so lint
verification remains part of evaluating compiler upgrades.

Keep suggestions advisory, fail warnings and errors, and move the existing
LiveStore duplicate-package exception into the shared plugin configuration.
Do not enable the new unstable-API adoption policy as part of this performance
change.
