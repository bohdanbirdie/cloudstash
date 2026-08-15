# DELTA-036: Raycast capture loses source and couples capabilities

Status: open

## Divergence

Raycast pairing records `source: raycast` and checks the integrations capability,
but its shared public-ingest request ignores key source metadata, requires
`publicApi`, and emits `source: api`. Source analytics are wrong and independent
overrides can create a connected but unusable Raycast client.

## Intent

[CS.SYS.ING-R03 and CS.SYS.ING-R05](../02-system/04-ingestion/requirements.md)
require each integration's authoritative capability boundary and source
preservation.

## Implementation

[`connect/raycast.ts`](../../src/cf-worker/connect/raycast.ts) stamps the paired
key and checks `integrations`. [`ingest/service.ts`](../../src/cf-worker/ingest/service.ts)
always checks `publicApi` and queues `source: api` without reading the key's
source metadata.

## Direction

update implementation

## Resolution Signal

Delete this delta when Raycast capture records `raycast`, one explicit capability
contract is enforced consistently at pairing and use, override combinations are
tested, and analytics/API responses preserve the selected source semantics.
