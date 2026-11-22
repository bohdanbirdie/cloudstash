# DELTA-031: Staging and operational runbooks are not realized

Status: open

## Divergence

Operations requires a remotely proven staging path and queryable tripwires with
recovery direction. Staging is declared as an Alchemy stage, but no recorded
rehearsal yet proves its critical boundaries. The saved-query/runbook set is
also still incomplete.

## Intent

[CS.OPS-R06 and CS.OPS-R11](../03-operations/requirements.md) require explicit
deployed evidence and owned recovery procedures.

## Implementation

[`alchemy.run.ts`](../../alchemy.run.ts) declares the `prod` and `staging`
stages; [`docs/staging.md`](../../docs/staging.md) describes the staging flow. `scripts/do-metrics.sh` still covers only part of the required
DLQ, sync, WebSocket, quota, and deletion signals and is not a portable
fail-closed runbook.

## Direction

update implementation

## Resolution Signal

Delete this delta when a recorded
rehearsal proves the critical browser/sync/Queue/MCP boundaries, and every
required tripwire has a portable, fail-closed query, owner, threshold, and
recovery procedure.
