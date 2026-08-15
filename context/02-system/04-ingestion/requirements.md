# Ingestion — Requirements

## Context

Owns how URLs enter a workspace from app and external sources, queue durability,
deduplication, and the boundary between accepted intake and synchronized save.

## Assumptions

- **CS.SYS.ING-A01 External producers are bursty:** Telegram, API, Raycast, and X
  may deliver several URLs concurrently and cannot host LiveStore themselves.
  - Validation: queue batch configuration and concurrent-processing history.
- **CS.SYS.ING-A02 Duplicate delivery is normal:** Provider retries, queue
  retries, and users may submit the same URL repeatedly.
  - Validation: Queue semantics and URL conflict handling.

## Constraints

- **CS.SYS.ING-C01 Queue retention:** Retry schedules cannot preserve a message
  beyond the configured Cloudflare Queue retention period.
- **CS.SYS.ING-C02 DO invocation lifetime:** A local server-side LiveStore commit
  may be stranded if the DO invocation ends before its push is durable.

## Acceptable Tradeoffs

- **CS.SYS.ING-T01 Queue acknowledgement:** Public external intake returns after
  the main Queue accepts a message, before a link event exists.
- **CS.SYS.ING-T02 Bounded durability wait:** A processor waits up to ten seconds
  for leader sync; timeout warns and preserves availability rather than always
  failing the RPC. The stricter alternative remains [CS-DQ2](../../open-questions.md).
- **CS.SYS.ING-T03 Poison drop:** Malformed queue messages are logged and
  acknowledged instead of retried indefinitely.

## Requirements

- **CS.SYS.ING-R01 Unified link creation:** Every capture path must resolve to
  the same versioned link-created event/materializer contract. `refines: CS-R01`
- **CS.SYS.ING-R02 Durable external intake:** API, Telegram, Raycast, and X
  ingestion must enter a durable Queue before request/source success is
  reported. `refines: CS-R11`
- **CS.SYS.ING-R03 Auth and capability:** Public API intake requires a valid
  workspace key and `publicApi` capability; integrations enforce their own
  connection/capability boundary. `refines: CS-R07`
- **CS.SYS.ING-R04 Boundary decoding:** Queue payloads must decode URL, workspace
  ID, source, and nullable source metadata before dispatch. `refines: CS.SYS-R06`
- **CS.SYS.ING-R05 Source preservation:** External link-created events record
  source and source metadata needed for downstream behavior.
- **CS.SYS.ING-R06 Idempotent duplicate handling:** Re-delivery of a URL must not
  create duplicate visible links or duplicate enrichment pipelines.
- **CS.SYS.ING-R07 Main retry:** Transient dispatch failure must retry with
  bounded exponential delay before dead-lettering.
- **CS.SYS.ING-R08 Dead-letter re-drive:** DLQ messages must be consumed,
  surfaced at error level, and retried over the declared recovery window.
- **CS.SYS.ING-R09 No implicit queue drop:** Unknown queue bindings and
  unexpected batch-level failures must request retry rather than return success.
- **CS.SYS.ING-R10 Processing handoff:** After creating a new link, the processor
  must establish its reactive processing subscription and hold follow-on work
  with the Durable Object execution context.
- **CS.SYS.ING-R11 Bounded leader barrier:** Newly created server-side events
  must attempt a session-to-leader durability barrier before processor success.
- **CS.SYS.ING-R12 Deletion tombstone:** Intake to a workspace being deleted
  must be dropped before creating or booting content state.
