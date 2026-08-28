# Enforce typed Effect error channels

Status: accepted

## Context

Effect's error channel is useful only when it preserves the failures an
operation can produce. An `unknown` error channel discards that contract, while
an assertion that narrows the channel can make tests or handlers assume a
failure shape that was never proved.

## Evidence and Argument

The initial diagnostics scan found one production `unknown` error channel in
the account-deletion workflow step interface and 20 unsafe error assertions in
tests. The workflow activities already exposed four concrete tagged error
types. The tests already checked concrete error classes but then repeated that
check as an unchecked cast instead of using the installed assertion primitive
that narrows the type.

## Options

| Option                                  | Tradeoffs                                                               |
| --------------------------------------- | ----------------------------------------------------------------------- |
| Fix the findings and enforce both rules | Preserves typed failures and prevents new unsafe narrowing              |
| Suppress the test findings              | Smaller diff, but keeps assertions that TypeScript cannot verify        |
| Leave the rules disabled                | Avoids migration work, but allows error contracts to degrade to unknown |

## Decision

Type the workflow step interface with the exact union of its tagged errors.
Use `assertInstanceOf` from `@effect/vitest/utils` when tests must verify and
narrow an error class. Promote `anyUnknownInErrorContext` and
`unsafeEffectTypeAssertion` to warnings after reaching a zero-warning baseline.

## Consequences

- Workflow orchestration retains the failure contract of its activities.
- Tests prove an error's runtime class before accessing class-specific fields.
- New broad error channels and unchecked Effect-channel narrowing fail the
  strict Effect diagnostic lane.
