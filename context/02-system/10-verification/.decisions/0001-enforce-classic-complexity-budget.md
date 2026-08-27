# Enforce a classic cyclomatic-complexity budget of 20

Status: accepted

## Context

Cloudstash's quality lane checks correctness, formatting, types, and Effect
diagnostics, but previously placed no enforced upper bound on the number of
independent paths within one function. The initial budget must reduce future
slop without forcing behavior changes or artificial abstractions merely to make
the baseline pass.

## Evidence and Argument

- Oxc's [`eslint/complexity`](https://oxc.rs/docs/guide/usage/linter/rules/eslint/complexity)
  defaults to a maximum of 20 and supports `classic` and `modified` variants.
- The initial `classic` inventory at 20 found five production or build functions
  at 21–24. A Worker E2E scenario measured 36, but splitting the scenario only
  to satisfy the metric reduced test locality without improving shipped code.
- Each production violation had an existing responsibility boundary: head-tag
  serialization, tag-trigger copy, user identity, chart indicators, or
  dot-matrix style resolution. Extracting those responsibilities made the
  default maximum of 20 practical without changing behavior.
- No Effect production function exceeds 20. Effect's current guidance favors
  inline `Effect.gen`, named `Effect.fn` for traced reusable operations, and
  `Effect.fnUntraced` for reusable internal or hot-path operations. Splitting a
  generator only to move branches would work against that guidance.
- Classic McCabe counting treats each `switch` case as another path. That keeps
  branch-heavy dispatch visible instead of discounting it because of syntax.

## Options

| Option                         | Tradeoffs                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------- |
| `max: 20`, `variant: classic`  | Uses Oxc's default and requires meaningful boundaries in five existing hotspots |
| `max: 24`, `variant: classic`  | Passes the old production baseline unchanged but provides a weaker guardrail    |
| `max: 36`, `variant: classic`  | Passes all old code unchanged; leaves substantial room for new complexity       |
| `max: 24`, `variant: modified` | Reduces large-switch noise; can hide branch-heavy dispatch behind compact code  |

## Decision

Enforce `max: 20` with `variant: classic` in the shared Vite+ lint
configuration. Apply it to application, Worker, and script code. Exclude test
files because their scenario orchestration and assertions do not represent
shipped implementation complexity, and extracting test phases merely to satisfy
the metric can make the behavior under test harder to review.

For future violations, first identify a real responsibility boundary. In
Effect code, preserve typed errors, resource safety, interruption, and
observability; use `Effect.fn` when the extracted operation deserves a trace and
`Effect.fnUntraced` when it is a reusable implementation detail. Do not create a
function that only wraps and returns `Effect.gen` to reduce the reported number.

## Consequences

- `vp lint` and the quality lane reject covered functions above 20; test files
  remain subject to the rest of the lint configuration.
- Optional chaining, default values, logical assignment, and each classic
  `switch` case contribute paths according to Oxc's rule semantics.
- The metric complements rather than replaces Effect diagnostics and review; it
  cannot determine whether Promise code should be modeled as Effect.
- Future changes can lower the maximum only when the complete lint corpus is
  green at the proposed value; the configured value remains one repo-wide
  budget rather than a collection of local ceilings.
