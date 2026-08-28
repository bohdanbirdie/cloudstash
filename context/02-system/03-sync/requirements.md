# Sync — Requirements

## Context

Owns LiveStore client topology, workspace event ordering, persistence,
WebSocket transport, rebase behavior, and server-side client recovery.

## Assumptions

- **CS.SYS.SYNC-A01 Modest per-workspace concurrency:** A workspace has a small
  number of concurrent browser, extension, processing, and agent writers.
  - Validation: product shape and LiveStore operating envelope.
- **CS.SYS.SYNC-A02 Server is an ordering peer:** The sync backend orders and
  distributes workspace events; local SQLite remains the read path.
  - Validation: LiveStore architecture and current adapter use.

## Constraints

- **CS.SYS.SYNC-C01 WebSocket hibernation:** Idle sync connections must not
  require resident JavaScript state or long-lived timers that disqualify
  Durable Object hibernation.
- **CS.SYS.SYNC-C02 Rebase is normal:** A client may be behind the server;
  `ServerAheadError` is protocol flow that triggers pull/rebase, not corruption
  by itself.
- **CS.SYS.SYNC-C03 Client DO eviction:** A server-side LiveStore client may be
  reconstructed from persisted DO state after any invocation.

## Acceptable Tradeoffs

- **CS.SYS.SYNC-T01 Eventual remote visibility:** A local commit is immediately
  visible locally but not necessarily persisted by the sync backend when
  `commit()` returns.
- **CS.SYS.SYNC-T02 Per-client replica:** LibraryDO and ChatAgentDO each
  persist their own LiveStore client replica, trading duplicate materialization
  for the common client model.

## Requirements

- **CS.SYS.SYNC-R01 Per-workspace ordering:** One SyncBackendDO must own accepted
  event ordering and live distribution for each workspace. `refines: CS-R03`
- **CS.SYS.SYNC-R02 Local commit path:** Browser/extension commits must
  materialize synchronously before network confirmation. `refines: CS-R02`
- **CS.SYS.SYNC-R03 Rebase convergence:** Pending events must rebase onto newer
  accepted history without losing the user mutation.
- **CS.SYS.SYNC-R04 Idempotent materialization:** Rebase/replay must not fail on
  reapplying the same insert event. `refines: CS.SYS.DATA-R04`
- **CS.SYS.SYNC-R05 Auth before routing:** The Worker must authorize a sync
  payload before forwarding it to the workspace backend. `refines: CS.SYS.AUTH-R01`
- **CS.SYS.SYNC-R06 Hibernation-safe liveness:** Live delivery must survive
  SyncBackendDO hibernation without process-resident subscription state.
- **CS.SYS.SYNC-R07 Cold client recovery:** Reverse RPC with a workspace ID must
  be able to boot an evicted server-side client and deliver the update.
- **CS.SYS.SYNC-R08 Single-flight client boot:** Concurrent requests to one
  client DO must share store creation and never open two LiveStore stores over
  the same DO SQLite.
- **CS.SYS.SYNC-R09 Arrival verification:** E2E tests must assert accepted events
  in SyncBackendDO's persisted eventlog, not only request success.
- **CS.SYS.SYNC-R10 Compatibility provenance:** Runtime LiveStore source and
  type/package snapshot must identify the same upstream revision.
