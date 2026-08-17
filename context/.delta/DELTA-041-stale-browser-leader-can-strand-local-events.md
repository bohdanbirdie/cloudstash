# DELTA-041: Stale browser leader can strand local events

Status: open

## Divergence

On 2026-08-17, a browser profile with a second Cloudstash tab left open accepted
six commits locally while the SyncBackendDO eventlog and a fresh browser did not
receive them. The affected UI presented no sync error, while a fresh browser
profile synchronized normally. Reloading and signing in again in only the
affected tab did not recover the local-only events.

The web adapter permits an older tab to remain the elected LiveStore leader
with its existing SharedWorker and dedicated leader Web Worker. Current evidence
localizes the observed stall after the local commit and before the backend push
handler. It does not yet distinguish a session-to-leader handoff stall from a
leader WebSocket push/ack stall, or prove that a client/backend protocol change
caused the incident.

The safe current recovery is to shut down every Cloudstash tab in the affected
browser profile and reopen the current application without clearing site data.
A future in-app recovery can coordinate `Store.shutdownPromise()` and reload
across all tabs, but code deployed after the stall cannot execute in an
already-running old bundle until that bundle reloads.

## Intent

[CS.SYS.SYNC-R03](../02-system/03-sync/requirements.md) requires pending events
to converge without losing the user's mutation. [CS.SYS.SYNC-R09](../02-system/03-sync/requirements.md)
requires verification at the persisted backend eventlog boundary.

## Implementation

[`store.ts`](../../src/livestore/store.ts) creates the persisted web adapter
with OPFS, a SharedWorker, and a dedicated leader worker, but its connection
monitor observes only network connectivity rather than pending-event progress.
[`sync-status-store.ts`](../../src/stores/sync-status-store.ts) initializes the
visible status as connected. The vendored
[`persisted-adapter.ts`](../../vendor/livestore/packages/@livestore/adapter-web/src/web-worker/client-session/persisted-adapter.ts)
routes every tab through a named SharedWorker and an elected tab's dedicated
leader worker. Current verification does not rehearse a deployment while a
second tab retains that older leader runtime.

## Direction

update implementation

## Resolution Signal

Delete this delta when a browser test holds an older second tab and leader
across a client/backend upgrade, proves any queued local event reaches the
SyncBackendDO eventlog, and proves incompatible or stalled clients receive an
actionable recovery. Recovery must coordinate shutdown/reload across tabs,
preserve OPFS, and expose pending-event progress rather than connectivity alone.
