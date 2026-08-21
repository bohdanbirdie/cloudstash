# Multi-chat architecture

Today, one `ChatAgentDO` represents one workspace and one conversation. The
future goal is multiple lightweight conversations per workspace.

## Direction

```text
LinkProcessorDO (today; rename later to a workspace-oriented name)
  one LiveStore client and materialized workspace state
  canonical link-operation RPCs
  workspace-scoped chat registry and usage accounting

ChatAgentDO (one per conversation)
  messages and model execution
  its own small SQLite state
  no LiveStore client
  link tools are thin calls to the workspace DO RPCs
```

Do not change `ChatAgentDO` during the REST/MCP capability work. First remove
the rejected `WorkspaceLinksDO` and consolidate link RPCs into the existing
`LinkProcessorDO`.

When this task is picked up:

1. Rename `LinkProcessorDO` to a workspace-oriented name that reflects its
   broader ownership; migrate the binding without creating another store.
2. Add chat lifecycle RPCs and a small workspace chat registry there.
3. Name each `ChatAgentDO` by chat ID and derive or persist its workspace ID.
4. Replace chat link tools with thin calls to the same canonical link RPCs used
   by REST and MCP.
5. Keep reprocessing unavailable to agent tools.
6. Move workspace-level usage accounting out of individual conversations.

## Why separate conversation DOs

- Conversation failures and storage stay isolated.
- Creating many chats does not create many LiveStore replicas.
- Existing DO-to-DO RPC is stable and already used by Cloudstash.
- Cloudflare Agents facets remain experimental and can be reconsidered when the
  planned `Chats` abstraction is stable.

## Open decisions

- final workspace DO name
- chat ID to workspace ID mapping
- chat count/retention policy
- chat list UX
- whether a stable Agents SDK chats primitive supersedes this design
