# Centralize REST and MCP link operations in the existing workspace client

Status: accepted

## Context

REST and MCP need equivalent link capabilities without coupling new work to the
current single-conversation chat implementation or creating one LiveStore client
per request.

## Evidence and Argument

- Link state is already workspace-scoped LiveStore content.
- LinkProcessorDO already keeps one workspace-named replica warm and exposes
  typed RPC.
- REST/MCP need the same validation, pagination, search, and mutation rules.
- ChatAgentDO will later become one lightweight conversation DO per chat, so it
  is the wrong long-term owner for workspace link operations.

## Options

| Option                              | Tradeoff                                                            |
| ----------------------------------- | ------------------------------------------------------------------- |
| Reuse `LinkProcessorDO`             | No extra replica; its name understates broader workspace ownership  |
| Add `WorkspaceLinksDO`              | Clean name now; duplicates materialization, sync, and warm duration |
| Keep operations in `ChatAgentDO`    | Fewer classes now; couples APIs to chat lifecycle                   |
| Build separate REST and MCP clients | Independent surfaces; duplicate replicas and policy                 |

## Decision

Use the existing workspace-named `LinkProcessorDO` for REST and MCP list,
search, get, save, and state/tag updates. Decode exact Effect Schemas at its RPC
boundary and commit through its cached LiveStore client with a bounded
durability barrier. Keep ChatAgentDO unchanged in this change; rename the
broader workspace owner and align chat during the planned multi-chat migration.

## Consequences

- External operations serialize per workspace without another LiveStore
  replica.
- Reprocessing remains an admin-app-only event and is absent from the contract.
- Account deletion reuses LinkProcessorDO's existing mark-and-purge lifecycle.
