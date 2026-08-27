# Enforce clean-baseline Effect anti-pattern diagnostics

Status: accepted

## Context

The default Effect language-service diagnostics protect core type and generator
correctness, but several off-by-default diagnostics directly encode Cloudstash's
Effect-first implementation policy. Enabling every Effect-native diagnostic at
once would create hundreds of findings across legitimate Worker entry points,
tests, adapters, and UI code, encouraging suppressions instead of better design.

## Evidence and Argument

A single combined scan of the 700-file TypeScript project found no existing
instances of:

- reusable Effect-returning functions missed by `effectFnOpportunity`;
- global timers used from Effect code;
- nested bare `Effect.gen` blocks; or
- JavaScript `try/catch` inside Effect generators.

The same scan showed that `strictEffectProvide` cannot distinguish all current
Worker/runtime/test composition roots, while blanket Effect-native enforcement
produces substantial framework-boundary noise.

## Options

| Option                                  | Tradeoffs                                                                     |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Enforce the four clean-baseline rules   | Prevents new anti-patterns immediately without migration work or suppressions |
| Enable every Effect-native diagnostic   | Broadest pressure, but creates hundreds of adapter and framework false alarms |
| Keep all off-by-default diagnostics off | Avoids noise, but permits known Effect anti-patterns to enter new code        |

## Decision

Promote `effectFnOpportunity`, `globalTimersInEffect`, `nestedEffectGenYield`,
and `tryCatchInEffectGen` to warning severity in the shared TypeScript plugin
configuration. `bun run check:effect` already runs with `--strict`, so new
findings fail the quality lane without changing TypeScript's normal severity.

Do not enable `strictEffectProvide` globally. Evaluate diagnostics with existing
findings separately, fixing genuine problems before promoting the rule rather
than committing broad suppressions or a permanent warning baseline.

## Consequences

- New reusable Effect operations are named Effect functions rather than plain
  wrappers returning Effects.
- Error handling and scheduling inside Effect remain compositional and
  testable.
- Generator extraction must represent a meaningful operation instead of a bare
  nested `Effect.gen` used to move code around.
- Framework and runtime boundaries remain review concerns until a diagnostic can
  represent their allowed shape without blanket exceptions.
