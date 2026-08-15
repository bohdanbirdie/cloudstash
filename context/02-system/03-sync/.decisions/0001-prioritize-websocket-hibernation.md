# Keep workspace sync compatible with Durable Object WebSocket hibernation

Status: accepted

## Context

Live synchronization keeps WebSockets open for long periods. A pending long
runtime timer prevented SyncBackendDO hibernation, turning idle connection time
into billed active duration and approaching the account quota.

## Evidence and Argument

- [PR #78](https://github.com/bohdanbirdie/cloudstash/pull/78) isolated
  `Effect.never`'s long `setInterval` as a hibernation disqualifier.
- [PR #79](https://github.com/bohdanbirdie/cloudstash/pull/79) reports roughly
  1,300× lower idle billing after the hibernation-safe path, with burst and
  wake/catch-up verification.
- LiveStore upstream subsequently carried hibernation and reverse-RPC recovery,
  allowing the local fork to be retired in PR #82.
- WebSocket attachments and Durable Object storage can preserve routing facts
  without keeping the JavaScript isolate resident.

## Options

| Option                                                                            | Tradeoffs                                                                                            |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Keep the sync DO resident for straightforward in-memory liveness                  | Simplest runtime model, but idle connections consume duration and can exhaust platform quota.        |
| Poll instead of maintaining live connections                                      | Hibernates naturally, but weakens real-time behavior and increases repeated request/auth work.       |
| Preserve live WebSockets while making server parks/subscriptions hibernation-safe | Requires adapter discipline and recovery tests, but retains real-time sync at sustainable idle cost. |

## Decision

Treat WebSocket hibernation compatibility as a sync invariant. Do not introduce
long-lived timers or process-only subscription state into the backend path.
Changes to Effect, RPC, LiveStore, or WebSocket handling must validate live
delivery after hibernation and inspect duration/timer evidence.
