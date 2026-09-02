# Integrations — Requirements

## Context

Owns external capture/retrieval realizations and the boundary by which they act
for a Cloudstash user and workspace.

## Assumptions

- **CS.SYS.INT-A01 External clients evolve separately:** Raycast, Chrome, X,
  Telegram, and future clients have independent platform release and review
  cycles.
  - Validation: separate Raycast repository, Chrome Web Store workflow, and
    provider APIs.
- **CS.SYS.INT-A02 Providers retry:** Webhooks, queues, reconnects, and polling
  may repeat the same logical action.
  - Validation: idempotent ingest and provider behavior.

## Constraints

- **CS.SYS.INT-C01 Platform policy:** Telegram/X APIs, Raycast Store, Chrome Web
  Store, OAuth, and MCP protocols impose contracts outside this repository.
- **CS.SYS.INT-C02 X bookmark API:** Official X bookmark reads expose at most the
  recent window, lack bookmark timestamps/server-side `since_id`, and may have
  pagination quirks; complete history cannot be promised.

## Acceptable Tradeoffs

- **CS.SYS.INT-T01 Different transport, common ingest:** Integrations may use
  webhook, paired key, WebSocket, polling/alarm, or Queue, but converge at the
  same workspace link contract.
- **CS.SYS.INT-T02 Connect-time X watermark:** X sync starts from the current
  newest bookmark and does not import the existing recent history by default,
  avoiding surprise cost/backlog.
- **CS.SYS.INT-T03 Best-effort source response:** Telegram draft/final
  notification failure does not undo a durable library save.

## Requirements

- **CS.SYS.INT-R01 Explicit authorization:** Every integration must be connected
  from an authenticated context or verify a provider webhook secret/key before
  acting. `refines: CS.SYS.AUTH-R01`
- **CS.SYS.INT-R02 Revocation:** Integration credentials and polling must be
  disconnectable; revocation must prevent future authenticated work.
- **CS.SYS.INT-R03 Workspace routing:** Every capture identifies exactly one
  authorized workspace and records its source. `refines: CS.SYS.ING-R05`
- **CS.SYS.INT-R04 Common durability:** External captures use the Queue and
  processor durability path unless the integration is itself a LiveStore
  client. `refines: CS.SYS.ING-R02`
- **CS.SYS.INT-R05 Entitlement enforcement:** Paid integration capabilities are
  checked server-side and self-heal on downgrade where background polling can
  continue.
- **CS.SYS.INT-R06 No secret copy by default:** Browser-mediated pairing should
  hand off a scoped key directly rather than requiring a user to paste a raw
  credential.
- **CS.SYS.INT-R07 Extension least privilege:** The browser extension must read
  active-tab fields only when needed for an explicit user capture action, store
  only its paired credential/local replica, and never inspect general page
  content or browsing history.
- **CS.SYS.INT-R08 X no historical surprise:** Initial X connect sets the
  watermark without enqueuing existing bookmarks; null-watermark recovery must
  do the same.
- **CS.SYS.INT-R09 X safe pagination:** Polling must stop at a recent durable
  checkpoint, enqueue oldest-first, and advance the head checkpoint only after
  complete traversal and successful admission of every newly observed
  bookmark.
- **CS.SYS.INT-R10 Source feedback:** Source-specific progress and confirmation
  must be idempotent and must not become the durability source of truth.
- **CS.SYS.INT-R11 Availability truth:** Store listings, landing tiles, and plan
  bullets must not claim an integration is shipped before a usable realization
  exists. `refines: CS.PROD-R10`
- **CS.SYS.INT-R12 X bounded recovery:** X traversal, monthly imported-bookmark
  admission, and provider reads must have durable workspace/period bounds.
  Work deferred at a bound must remain recoverable after the next allowance
  reset rather than being silently skipped.
