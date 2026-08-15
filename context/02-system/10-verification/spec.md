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

## Data-Layer Tests

`src/livestore/__tests__` uses LiveStore's in-memory web adapter with unique
store IDs and shutdown per test. Tests cover event migration, ingestion,
reprocess, tagging, tag deletion cascade, each materializer family, and query
semantics. This avoids mocks that can pass while real SQL/materialization fails.

Wire-format tests retain prior-runtime golden eventlog rows so the Effect v4 and
LiveStore source change cannot silently alter deployed history serialization.

## Worker E2E

The Cloudflare pool applies test migrations and runs real Worker entry points and
stateful bindings. Sync tests read the backend eventlog from fresh stubs. Forced
idle-eviction tests call `abortAllDurableObjects()` only after quiescing relevant
live pull, discard pre-abort stubs, and inspect a persisted owner after wake.
This specifically targets fire-and-forget fibers and store reconstruction.

Provider-heavy AI is stubbed where the target contract permits. Timing-dependent
pipeline settlement without a hermetic stub is not accepted as sync durability
evidence.

## Known Coverage Limits

Current Worker tests prove many direct handler/DO paths but do not yet certify
all platform behavior implied by their names: Queue tests call the exported
batch handler with constructed messages; deletion completion tests do not seed
and inspect every storage owner; some sync-auth assertions accept any status
other than one malformed-request code. These limits are tracked in
[DELTA-027](../../.delta/DELTA-027-verification-names-overstate-covered-boundaries.md)
rather than represented as stronger evidence.
