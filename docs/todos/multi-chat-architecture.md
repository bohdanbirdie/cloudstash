# Add multiple chat sessions per library

- Code: `AI-09`
- Priority: medium
- Depends on: `AI-03`
- Status: in progress

Today, one `ChatAgentDO` represents one library and one conversation. After
`AI-03` removes its LiveStore replica, add multiple lightweight conversations
without recreating that cost.

## Direction

```text
LinkProcessorDO (one per library)
  one LiveStore client and materialized workspace state
  canonical link-operation RPCs
  library-scoped chat registry and usage accounting

ChatAgentDO (one per conversation)
  messages and model execution
  its own small SQLite state
  no LiveStore client
  link tools remain thin calls to LinkProcessorDO RPCs
```

`AI-03` has shipped and proved that the current chat works without a LiveStore
client. This task now owns conversation identity, lifecycle, shared accounting,
and seamless context compaction.

When this task is picked up:

1. Add chat lifecycle RPCs and a small library chat registry to `LinkProcessorDO`.
2. Name each `ChatAgentDO` by chat ID and persist its validated library ID.
3. Keep link tools on the same canonical `LinkProcessorDO` RPCs established by
   `AI-03`.
4. Keep reprocessing unavailable to agent tools.
5. Move library-level settled-spend accounting out of individual conversations
   so every chat uses the shared allowance.
6. Add bounded retention/deletion and the minimal chat-list UI.
7. Remove `/clear`; creating a new conversation replaces the destructive reset
   command, while normal session deletion follows the same retention path.
8. Preserve the complete UI transcript while privately compacting older model
   context into a rolling bounded summary.

Implement the shared allowance work from `AI-11` in this task rather than adding
a second accounting migration. Public Assistant credits and the private
settled-cost limit share one library-wide ledger across every conversation.

## Why separate conversation DOs

- Conversation failures and storage stay isolated.
- Creating many chats does not create many LiveStore replicas.
- Existing DO-to-DO RPC is stable and already used by Cloudstash.
- Cloudflare Agents facets remain experimental and can be reconsidered when the
  planned `Chats` abstraction is stable.

## Accepted first version

- The original workspace-named chat remains the default; new actors use UUIDs
  and persist their validated library binding.
- `LinkProcessorDO` key-value storage keeps at most 50 metadata records. It is
  not D1 and does not initialize LiveStore when listing sessions.
- Only the selected chat's messages load. Registry metadata preloads after the
  chat entitlement resolves.
- The final session can be deleted; the empty registry remains empty until the
  user starts a fresh chat. Account deletion retires every registered actor.
- The visible transcript remains complete; only provider context is compacted.
- The experimental Session API is not adopted.

## Platform note

Cloudflare's current stable `AIChatAgent` persists one flat conversation per
named Agent instance. Its Session API adds richer tree/context memory but remains
experimental. The lean default for this task is therefore one named
`ChatAgentDO` per conversation plus a small `LinkProcessorDO` registry, unless the
platform has a stable simpler primitive when implementation starts.
