# DELTA-027: Verification names overstate covered boundaries

Status: open

## Divergence

Several green tests exercise narrower behavior than their names/contracts imply:
constructed Queue batches do not prove platform retry/DLQ routing, account
deletion completion does not inspect every storage owner, and a valid sync-auth
assertion accepts any response status other than one malformed-request code.

## Intent

[CS.SYS.VER-R04, CS.SYS.VER-R10, and CS.SYS.VER-R11](../02-system/10-verification/requirements.md)
require realistic boundary evidence and prohibit false-green assertions.

## Implementation

[Worker E2E tests](../../src/cf-worker/__tests__/e2e/do-sync.test.ts) call
`handleQueueBatch` directly, deletion tests primarily inspect Workflow/D1
completion, and
[`sync.test.ts`](../../src/cf-worker/__tests__/e2e/sync.test.ts) uses a non-400
assertion for a valid path. CI now runs ordinary build certification; remaining
release-certification gaps are tracked separately by DELTA-020.

## Direction

update implementation

## Resolution Signal

Delete this delta when tests/labels distinguish handler simulation from platform
E2E, assert exact successful auth outcomes, seed/inspect all deletion owners and
failure retries, and exercise exported Queue/dead-letter routing where the local
runtime supports it.
