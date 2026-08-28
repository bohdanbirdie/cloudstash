# Add multiple chat sessions per library

- Code: `AI-09`
- Priority: medium
- Depends on: `AI-03`

Today, one `ChatAgentDO` represents one library and one conversation. After
`AI-03` removes its LiveStore replica, add multiple lightweight conversations
without recreating that cost.

## Direction

```text
LibraryDO (one per library)
  one LiveStore client and materialized workspace state
  canonical link-operation RPCs
  library-scoped chat registry and usage accounting

ChatAgentDO (one per conversation)
  messages and model execution
  its own small SQLite state
  no LiveStore client
  link tools remain thin calls to LibraryDO RPCs
```

Do not combine this with `AI-03`. First prove that the current single chat keeps
working without a LiveStore client; only then change conversation identity and
UI.

When this task is picked up:

1. Add chat lifecycle RPCs and a small library chat registry to `LibraryDO`.
2. Name each `ChatAgentDO` by chat ID and persist its validated library ID.
3. Keep link tools on the same canonical `LibraryDO` RPCs established by
   `AI-03`.
4. Keep reprocessing unavailable to agent tools.
5. Move library-level usage reservation out of individual conversations so
   parallel chats cannot exceed the shared budget.
6. Add bounded retention/deletion and the minimal chat-list UI.

## Why separate conversation DOs

- Conversation failures and storage stay isolated.
- Creating many chats does not create many LiveStore replicas.
- Existing DO-to-DO RPC is stable and already used by Cloudstash.
- Cloudflare Agents facets remain experimental and can be reconsidered when the
  planned `Chats` abstraction is stable.

## Open decisions

- chat ID to library ID mapping
- chat count/retention policy
- chat list UX
- whether Cloudflare's experimental Session API has graduated and materially
  simplifies the design by then; do not adopt an experimental memory layer only
  to obtain multiple conversations

## Platform note

Cloudflare's current stable `AIChatAgent` persists one flat conversation per
named Agent instance. Its Session API adds richer tree/context memory but remains
experimental. The lean default for this task is therefore one named
`ChatAgentDO` per conversation plus a small `LibraryDO` registry, unless the
platform has a stable simpler primitive when implementation starts.
