# DELTA-031: Staging and operational runbooks are not realized

Status: open

## Divergence

Operations requires a remotely proven staging path and queryable tripwires with
recovery direction. The repository now defines the isolated environment, branch
policy, artifact-first scripts, and bootstrap procedure, but the remote Worker,
resources, secrets, domain, GitHub branch trigger, and smoke evidence remain
maintainer-controlled and unverified. The saved-query/runbook set is also still
incomplete.

## Intent

[CS.OPS-R06 and CS.OPS-R11](../03-operations/requirements.md) require explicit
deployed evidence and owned recovery procedures.

## Implementation

[`wrangler.jsonc`](../../wrangler.jsonc) defines `env.staging` with isolated
stateful resources. [`package.json`](../../package.json) provides staging build,
artifact verification, migration, and deployment commands, and
[`docs/staging.md`](../../docs/staging.md) owns the maintainer bootstrap and
branch procedure. `scripts/do-metrics.sh` still covers only part of the required
DLQ, sync, WebSocket, quota, and deletion signals and is not a portable
fail-closed runbook.

## Direction

update implementation

## Resolution Signal

Delete this delta when the staging Worker is remotely provisioned and a recorded
rehearsal proves the critical browser/sync/Queue/MCP boundaries, and every
required tripwire has a portable, fail-closed query, owner, threshold, and
recovery procedure.
