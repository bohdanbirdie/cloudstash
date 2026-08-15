# Data — Requirements

## Context

Owns durable data placement, workspace history, event compatibility, and
materialized state. It refines [system requirements](../requirements.md).

## Assumptions

- **CS.SYS.DATA-A01 Rebuild is feasible:** One workspace history can be replayed
  within client/runtime limits to rebuild SQLite state.
  - Validation: LiveStore rematerialization behavior and current production
    event volume documented in the
    [2026-08 incident](../../../docs/incidents/2026-08-10-do-rows-written-cap-v4-cutover.md).

## Constraints

- **CS.SYS.DATA-C01 Immutable deployed events:** Existing event names and
  required payload fields cannot be changed incompatibly.
- **CS.SYS.DATA-C02 D1 and eventlog are not transactional together:** No atomic
  commit spans control-plane D1 and workspace LiveStore history.

## Acceptable Tradeoffs

- **CS.SYS.DATA-T01 Derived duplication:** Metadata snapshots, summaries,
  processing status, and effective tags are materialized for query speed even
  though history is canonical.
- **CS.SYS.DATA-T02 Reversible link archiving:** Links use a reversible `deletedAt`
  state; irreversible erasure is reserved for workspace/account deletion.

## Requirements

- **CS.SYS.DATA-R01 Declared planes:** D1 control data, workspace event data,
  per-DO operational state, KV mappings, and queue messages must have explicit
  ownership and deletion behavior. `refines: CS.SYS-R01`
- **CS.SYS.DATA-R02 Canonical history:** The workspace eventlog is the source of
  truth for links, metadata snapshots, summaries, tags, interactions,
  processing status, and weekly digests. `refines: CS-R05`
- **CS.SYS.DATA-R03 Deterministic materialization:** The same schema and event
  history must derive the same workspace state.
- **CS.SYS.DATA-R04 Idempotent inserts:** Materializers that insert
  client-generated identities must tolerate replay/rebase of the same event.
  `refines: CS.SYS-R07`
- **CS.SYS.DATA-R05 Versioned event evolution:** Breaking payload changes must
  use a new event name/version while retaining old materializers.
- **CS.SYS.DATA-R06 Workspace partition:** Content queries and events must be
  scoped by the authorized workspace store, not by ad hoc row filtering.
- **CS.SYS.DATA-R07 URL deduplication:** One normalized input URL may have at
  most one visible link row per workspace; repeated ingestion is idempotent.
- **CS.SYS.DATA-R08 Independent lifecycles:** Reading status, archival state, and
  processing status must remain independent dimensions.
- **CS.SYS.DATA-R09 Latest derivation:** UI/API reads select the latest metadata
  snapshot and summary without discarding historical event facts.
- **CS.SYS.DATA-R10 No full-page retention:** Extracted page content used for
  summarization must not become durable workspace state unless a future privacy
  decision explicitly changes the contract.
