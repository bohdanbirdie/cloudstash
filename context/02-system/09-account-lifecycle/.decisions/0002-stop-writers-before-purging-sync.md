# Stop writers before purging canonical sync

Status: accepted

## Context

Account deletion spans one canonical SyncBackend eventlog and server-side
LinkProcessor and Chat LiveStore clients. Purging SyncBackend first leaves a
Workflow-step gap in which either surviving client can reconnect and recreate
the eventlog. Making SyncBackend understand account deletion would couple the
LiveStore transport to an application lifecycle.

## Evidence and Argument

- Better Auth has removed the identity before destructive Workflow steps, so
  normal browser and extension sync authentication already rejects reconnects.
- LinkProcessor and Chat have generic terminal retirement that closes their
  LiveStore clients and rejects delayed work without exposing deletion state to
  domain services.
- Cloudflare Workflow steps are ordered and retry independently, so completing
  both client retirements before SyncBackend purge removes the known internal
  writers before the canonical delete.

## Options

| Option                                              | Tradeoffs                                                                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Retire writers, then purge SyncBackend              | Uses existing actor lifecycle and auth boundaries; SyncBackend needs no deletion gate or retained marker.             |
| Purge SyncBackend first and gate every sync handler | Makes the backend independently terminal, but couples application deletion state to LiveStore request and push paths. |

## Decision

Retire LinkProcessor and Chat before purging SyncBackend. Keep their generic
terminal markers because delayed internal work can still address those actors.
SyncBackend closes its sockets and deletes all storage only after those writers
stop; it does not retain or interpret an account-deletion marker.
