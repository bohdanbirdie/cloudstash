# DELTA-031: Staging and operational runbooks are not realized

Status: open

## Divergence

Operations requires a remotely proven staging path and queryable tripwires with
recovery direction. The repository has no staging environment: the Wrangler
`staging` environment was removed with the move to Alchemy, and a staging stage
is not yet declared. The `staging` branch policy and promotion workflow remain.
The saved-query/runbook set is also still incomplete.

## Intent

[CS.OPS-R06 and CS.OPS-R11](../03-operations/requirements.md) require explicit
deployed evidence and owned recovery procedures.

## Implementation

[`alchemy.run.ts`](../../alchemy.run.ts) declares only the production stage
and local development. [`docs/staging.md`](../../docs/staging.md) records that
staging is retired until it is rebuilt as an Alchemy stage. `scripts/do-metrics.sh` still covers only part of the required
DLQ, sync, WebSocket, quota, and deletion signals and is not a portable
fail-closed runbook.

## Direction

update implementation

## Resolution Signal

Delete this delta when the staging Worker is remotely provisioned and a recorded
rehearsal proves the critical browser/sync/Queue/MCP boundaries, and every
required tripwire has a portable, fail-closed query, owner, threshold, and
recovery procedure.
