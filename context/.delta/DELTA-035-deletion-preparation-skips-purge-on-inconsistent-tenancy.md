# DELTA-035: Deletion preparation skips purge on inconsistent tenancy

Status: open

## Divergence

Missing personal organization, missing membership, or non-owner membership is
converted to a warning and `null`, allowing Better Auth to remove the user
without starting the content/external purge Workflow. This can orphan data when
tenancy state is inconsistent.

## Intent

[CS.SYS.LIFE-R04](../02-system/09-account-lifecycle/requirements.md) requires
fail-loud orchestration or a separately durable recovery path before user
removal.

## Implementation

[`account-deletion/prepare.ts`](../../src/cf-worker/account-deletion/prepare.ts)
raises `MissingActiveOrgError` for all three states, catches it as `null`, logs
“skipping purge workflow,” and returns successfully to the Better Auth
`beforeDelete` hook.

## Direction

update implementation

## Resolution Signal

Delete this delta when inconsistent ownership blocks user deletion or records a
durable operator-recoverable purge task, and tests prove missing org/membership/
owner cases cannot silently remove the only identity while leaving storage.
