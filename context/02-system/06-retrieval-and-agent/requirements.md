# Retrieval and Agent — Requirements

## Context

Owns local search/filtering, export, public Vault reads, and the workspace chat
agent's retrieval and mutation tools.

## Assumptions

- **CS.SYS.RET-A01 Local SQL is sufficient:** Current workspace size and fields
  can be searched interactively with indexed/LIKE SQLite queries without a
  remote search service.
  - Validation: current query implementation and list performance work.
- **CS.SYS.RET-A02 Agent is a Vault interface:** Chat adds natural-language
  access to existing workspace operations; it is not an independent source of
  content truth.
  - Validation: tools commit/query the same LiveStore store.

## Constraints

- **CS.SYS.RET-C01 Model context is bounded:** Full chat history may be retained
  for UI but only a bounded recent window is sent to the model.
- **CS.SYS.RET-C02 Public API pages are bounded:** Link listing uses validated
  limits and opaque cursor pagination.

## Acceptable Tradeoffs

- **CS.SYS.RET-T01 LIKE search:** Case-insensitive LIKE and weighted fields are
  accepted instead of FTS5 to avoid a custom SQLite build.
- **CS.SYS.RET-T02 Shared ChatAgent read client:** The public links API reuses
  the workspace ChatAgentDO LiveStore replica, coupling API reads to that
  stateful client but avoiding another replica class.
- **CS.SYS.RET-T03 Approximate chat budget:** Token reservations use estimates
  reconciled after calls; fail-closed budget lookup may temporarily deny chat.

## Requirements

- **CS.SYS.RET-R01 Local retrieval:** Search and filters must execute over local
  workspace state and work offline. `refines: CS.PROD-R06`
- **CS.SYS.RET-R02 Multi-field AND search:** Every query word must match at
  least one supported field; ranking must prefer title and effective tags over
  weaker URL text.
- **CS.SYS.RET-R03 Effective tag filters:** Multi-tag filters require every
  selected effective tag and include valid pending suggestions.
- **CS.SYS.RET-R04 Export without lock-in:** Without a paid gate, a user must be
  able to export all links in the selected workspace with URL, title,
  description, summary, reading/archival timestamps, and explicit/effective tags
  in a documented portable format. `refines: CS-R08`
- **CS.SYS.RET-R05 Authorized API reads:** `GET /api/links` requires a valid
  workspace key and `publicApi` capability and returns only that workspace.
- **CS.SYS.RET-R06 Stable pagination:** API listing uses deterministic keyset
  order and an opaque, validated cursor.
- **CS.SYS.RET-R07 Agent workspace scope:** Chat identity, store, tools, usage,
  and authentication must resolve to one workspace. `refines: CS-R06`
- **CS.SYS.RET-R08 Server tools:** The entitled agent must expose server-side
  tools that search and inspect Vault links and mutate supported link state over
  the workspace store; the model does not receive direct database access.
- **CS.SYS.RET-R09 Archival confirmation:** Agent tools that archive one or many
  links require human confirmation before execution.
- **CS.SYS.RET-R10 Guardrails:** Agent input, step count, context window, errors,
  and monthly budget must be bounded before or during provider execution.
- **CS.SYS.RET-R11 Citations:** When an agent answer relies on a Vault link,
  its response/tool result must include the relevant link ID/URL so the client
  can render a grounded record.
