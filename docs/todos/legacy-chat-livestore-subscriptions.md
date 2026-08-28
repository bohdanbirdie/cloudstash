# Retire legacy chat LiveStore subscriptions

- Code: `AI-10`
- Priority: medium
- Depends on: `AI-03` and a supported LiveStore DO-RPC unsubscribe operation

## Goal

Remove the persisted SyncBackend callback registrations created by the former
chat LiveStore client, then remove `ChatAgentDO.syncUpdateRpc` without reading
or mutating LiveStore's private storage from Cloudstash.

## Current compatibility state

After `AI-03`, new chat actors do not create a LiveStore client or register a
callback. Existing registrations may still invoke a no-op compatibility method
for each emitted push chunk. The callback performs no decoding,
materialization, or Chat DO storage work, but the Durable Object RPC itself
remains billable.

## Direction

1. Add a supported, idempotent unsubscribe operation to LiveStore's DO-RPC
   transport and consume it through an upstream release or snapshot.
2. Unsubscribe when an existing chat actor next opens and on the first late
   callback, covering both quiet and active libraries.
3. Observe deployed cleanup and verify SyncBackend no longer calls chat actors.
4. Remove the compatibility method only when absence can be established; keep
   it as a permanent no-op if global proof is impractical.

## Guardrails

- Do not edit `vendor/livestore` in Cloudstash.
- Do not read or delete private `rpc-sub:*` keys from application code.
- Do not create another chat Durable Object class merely to hide the stale
  registration; it would leave the old callback alive.
