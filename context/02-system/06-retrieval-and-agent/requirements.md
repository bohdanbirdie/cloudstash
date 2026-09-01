# Retrieval and Agent — Requirements

## Context

Owns local search/filtering, export, public library reads, and the workspace chat
agent's retrieval and mutation tools.

## Assumptions

- **CS.SYS.RET-A01 Local SQL is sufficient:** Current workspace size and fields
  can be searched interactively with indexed/LIKE SQLite queries without a
  remote search service.
  - Validation: current query implementation and list performance work.
- **CS.SYS.RET-A02 Agent is a library interface:** Chat adds natural-language
  access to existing workspace operations; it is not an independent source of
  content truth.
  - Validation: tools use the canonical workspace LinkProcessor RPC contract.

## Constraints

- **CS.SYS.RET-C01 Model context is bounded:** Full chat history may be retained
  for UI, but the model receives only a bounded recent window plus a bounded
  private summary of older context.
- **CS.SYS.RET-C02 Public API pages are bounded:** Link listing uses validated
  limits and opaque cursor pagination.

## Acceptable Tradeoffs

- **CS.SYS.RET-T01 LIKE search:** Case-insensitive LIKE and weighted fields are
  accepted instead of FTS5 to avoid a custom SQLite build.
- **CS.SYS.RET-T02 Shared LinkProcessor client:** REST, MCP, and chat reuse the
  workspace-named LinkProcessorDO LiveStore replica. Each chat keeps its own
  message history and private context summary; the LinkProcessor actor owns the
  lightweight chat registry and library-wide usage ledger.
- **CS.SYS.RET-T03 Settled Assistant allowance:** Every conversation checks the
  shared settled-cost aggregate before provider work and appends actual reported
  cost afterward. Rare overlapping short runs may settle slightly above the
  limit; fail-closed allowance lookup may temporarily deny chat.

## Requirements

- **CS.SYS.RET-R01 Local retrieval:** Search and filters must execute over local
  workspace state and work offline. `refines: CS.PROD-R06`
- **CS.SYS.RET-R02 Ranked multi-field search:** By default, a result may match
  any query term and accumulates each field's weight; callers may require every
  term with `match=all`. Title and effective tags must outrank URL text.
- **CS.SYS.RET-R03 Effective tag filters:** Multi-tag filters require every
  selected effective tag and include valid pending suggestions.
- **CS.SYS.RET-R04 Export without lock-in:** Without a paid gate, a user must be
  able to export all links in the selected workspace with URL, title,
  description, summary, reading/archival timestamps, and explicit/effective tags
  in a documented portable format. `refines: CS-R08`
- **CS.SYS.RET-R05 Authorized API operations:** Link REST operations require a
  valid workspace key and `publicApi` capability and affect only that workspace.
- **CS.SYS.RET-R06 Stable pagination:** API listing uses deterministic keyset
  order and an opaque, validated cursor.
- **CS.SYS.RET-R07 Agent workspace scope:** Chat identity, store, tools, usage,
  and authentication must resolve to one workspace. `refines: CS-R06`
- **CS.SYS.RET-R08 Server tools:** The entitled agent must expose server-side
  tools that search and inspect library links and mutate supported link state over
  the workspace store; the model does not receive direct database access.
- **CS.SYS.RET-R09 Archival confirmation:** Agent tools that archive one or many
  links require human confirmation before execution.
- **CS.SYS.RET-R10 Guardrails:** Agent input, step count, context window, errors,
  and monthly Assistant allowance must be bounded before or during model
  execution.
- **CS.SYS.RET-R12 Conversation isolation:** A library may have multiple chat
  histories. Listing their metadata must not materialize another library client,
  and loading one conversation must not load the message content of another.
- **CS.SYS.RET-R11 Citations:** When an agent answer relies on a library link,
  its response/tool result must include the relevant link ID/URL so the client
  can render a grounded record.
