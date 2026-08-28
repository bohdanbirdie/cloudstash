# Verification — Spec

This document specifies verification lanes and evidence. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Lanes

| Lane       | Command/config                              | Owns                                                            |
| ---------- | ------------------------------------------- | --------------------------------------------------------------- |
| Quality    | `bun run check`, `bun run typecheck`        | format, lint, Effect diagnostics, TypeScript                    |
| Unit/data  | `bun run test:unit` / `vitest.config.ts`    | pure domain/service/UI tests and real in-memory LiveStore flows |
| Worker E2E | `bun run test:e2e` / `vitest.e2e.config.ts` | D1, DOs, queues, workflows, Worker routes, forced eviction      |
| Extension  | `bun run test:ext` + compile                | WXT extension messages/services/build                           |

Intent enforcement, production build certification, CI composition, and
external release/config checks are delivery concerns documented in
[`04-delivery`](../../04-delivery/).

## Complexity Budget

The Vite+ lint configuration enforces Oxc `eslint/complexity` with a maximum of
20 using the `classic` variant across application, Worker, and script code that
participates in the normal lint lane. Test files are excluded because scenario
orchestration and assertion branches do not represent shipped implementation
complexity. The quality lane fails when a covered function exceeds the budget.
New per-file or inline exceptions are not the default remedy. A split must
follow an existing responsibility boundary rather than merely moving branches
to satisfy the metric. Reusable Effect operations use `Effect.fn` or
`Effect.fnUntraced` according to whether the boundary merits its own trace. The
budget may ratchet downward when the covered lint corpus supports the lower
limit. The baseline choice is recorded in
[decision 0001](./.decisions/0001-enforce-classic-complexity-budget.md).

## Effect Anti-Pattern Baseline

The Effect language service runs in strict mode in the quality lane. In addition
to its default correctness diagnostics, the project promotes selected
diagnostics to warnings, which strict mode treats as failures: reusable
Effect-returning functions must use `Effect.fn` or `Effect.fnUntraced`, Effect
generators must not use JavaScript `try/catch`, nested bare `Effect.gen` blocks
must become meaningful operations, and Effect code must use Effect scheduling
instead of global timers. HTTP requests inside Effect use Effect's HTTP client
instead of global `fetch`. Effect error channels must not contain `unknown`,
and type assertions must not unsafely narrow Effect error or requirement
channels. The selection deliberately excludes rules that misclassify Worker
entry points or framework adapters and is recorded in [decision
0002](./.decisions/0002-enforce-zero-baseline-effect-diagnostics.md), [decision
0003](./.decisions/0003-enforce-typed-effect-error-channels.md), and [decision
0004](./.decisions/0004-use-effect-http-client.md).

## Data-Layer Tests

`src/livestore/__tests__` uses LiveStore's in-memory web adapter with unique
store IDs and shutdown per test. Tests cover event migration, ingestion,
reprocess, tagging, tag deletion cascade, each materializer family, and query
semantics. This avoids mocks that can pass while real SQL/materialization fails.

Wire-format tests retain prior-runtime golden eventlog rows so the Effect v4 and
LiveStore source change cannot silently alter deployed history serialization.

## Test Seams and Type Evidence

Worker tests must not replace imported modules through Vitest or Jest module
mocking. External behavior is substituted through an existing service/layer
boundary or a narrow dependency accepted by the production constructor. Where
the test targets an installed library's pure contract, fixtures use that
library's real public types and runtime helpers. UI tests are not yet part of
this enforcement boundary.

Production code must not force values through chained TypeScript assertions
such as `value as unknown as Target`. Callers preserve a precise source type,
validate data at the boundary, or use an assignable public interface. Tests may
still construct partial platform fixtures with chained assertions because
implementing full Cloudflare runtime objects is outside those unit tests' scope.
The enforcement boundary and initial migrations are recorded in [decision
0005](./.decisions/0005-enforce-worker-test-seams-and-production-type-evidence.md).

## Worker E2E

The Cloudflare pool applies test migrations and runs real Worker entry points and
stateful bindings. Sync tests read the backend eventlog from fresh stubs. Forced
idle-eviction tests call `abortAllDurableObjects()` only after quiescing relevant
live pull, discard pre-abort stubs, and inspect a persisted owner after wake.
This specifically targets fire-and-forget fibers and store reconstruction.
X reconciliation tests drive authenticated entitlement changes and scheduled
repair through the configured local Queue producer and consumer before
inspecting the real per-user Durable Object's state and alarm. Capability
regressions verify Raycast source-specific intake, Telegram downgrade checks,
X alarm suspension after capability revocation, digest alarm reconciliation,
manual digest denial, and concurrent enrichment reservation at the configured
cap. Focused failure-path tests use explicit
typed dependency implementations and call recorders rather than framework-level
function, module, or global mocks.

Provider-heavy AI is stubbed where the target contract permits. Timing-dependent
pipeline settlement without a hermetic stub is not accepted as sync durability
evidence.

## Known Coverage Limits

Current Worker tests prove many direct handler/DO paths but do not yet certify
all platform behavior implied by their names: Link Queue tests call the exported
batch handler with constructed messages; deletion completion tests do not seed
and inspect every storage owner; some sync-auth assertions accept any status
other than one malformed-request code. These limits are tracked in
[DELTA-027](../../.delta/DELTA-027-verification-names-overstate-covered-boundaries.md)
rather than represented as stronger evidence.
