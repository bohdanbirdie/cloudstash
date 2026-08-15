# DELTA-031: Staging and operational runbooks are not realized

Status: open

## Divergence

Operations requires staging or bounded production verification and queryable
tripwires with recovery direction, but no Wrangler staging environment/script or
complete saved-query/runbook set exists. README mentions a staging deploy
command that package scripts do not provide.

## Intent

[CS.OPS-R06 and CS.OPS-R11](../03-operations/requirements.md) require explicit
deployed evidence and owned recovery procedures.

## Implementation

[`wrangler.jsonc`](../../wrangler.jsonc) defines no staging environment and
[`package.json`](../../package.json) defines no `deploy:staging` script.
`scripts/do-metrics.sh` covers only part of the required DLQ, sync, WebSocket,
quota, and deletion signals and is not a portable fail-closed runbook.

## Direction

update implementation

## Resolution Signal

Delete this delta when each critical change has an implemented staging or
bounded-production path and every required tripwire has a portable, fail-closed
query, owner, threshold, and recovery procedure.
