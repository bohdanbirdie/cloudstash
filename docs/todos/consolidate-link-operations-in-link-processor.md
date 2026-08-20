# Consolidate link operations in LinkProcessorDO

## Decision

`LinkProcessorDO` remains the single Cloudflare-side owner of each workspace's
materialized LiveStore state. REST, MCP, ingestion, processing, and future chat
tools must reuse that one cached store through typed RPCs.

Remove `WorkspaceLinksDO`. A second workspace-scoped DO would duplicate the
LiveStore client, rematerialization, synchronization, and warm duration without
adding an ownership boundary.

Do not change `ChatAgentDO` in this work.

## Target boundary

```text
REST / MCP / ingestion / future chat tools
                    |
                    v
LinkProcessorDO (one named instance per workspace)
  cached LiveStore store
  link-operation RPCs
  ingestion and processing
  notifications and digest scheduling
```

Link operations remain Effect services:

```text
WorkspaceLinks.Default
└── WorkspaceLinkRepositoryLive(existing cached store)
```

The RPC class is transport and ownership only. Authorization and capability
checks remain at the REST/MCP boundaries; domain validation, query semantics,
and mutations remain in the shared Effect service.

## Implementation

1. Add typed list/search/get/save/update/batch-update RPC methods to
   `LinkProcessorDO`, backed by its existing cached store.
2. Route REST and MCP through the existing `LINK_PROCESSOR_DO` binding.
3. Reuse the current `WorkspaceLinks` service and repository layers; do not
   duplicate queries or mutations in RPC handlers.
4. Make the existing LinkProcessor deletion tombstone and purge path the only
   workspace cleanup lifecycle.
5. Delete `WorkspaceLinksDO`, its binding, migration, export, tests, and all
   documentation claims that it exists.
6. Update focused unit, RPC, REST, MCP, deletion, and real-DO tests.
7. Update the owning Intent nodes after the runtime shape is final.

## Future follow-up

Rename `LinkProcessorDO` to a workspace-oriented name when chat architecture is
revisited. At that point, keep each `ChatAgentDO` lightweight and without a
LiveStore client; chat tools call the workspace DO's canonical link RPCs.

## Verification gates

- no `WORKSPACE_LINKS_DO` binding or `WorkspaceLinksDO` class remains
- exactly one Cloudflare-side LiveStore client per workspace
- REST and MCP parity tests pass, including pagination and batch mutation
- no API/MCP reprocessing surface exists
- deletion tombstone and purge tests pass through `LinkProcessorDO`
- `bun run check`, focused E2E, `bun run check:intent`, and `git diff --check`
  pass
