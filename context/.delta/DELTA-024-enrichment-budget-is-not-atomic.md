# DELTA-024: X enrichment budget is not atomic

Status: open

## Divergence

Concurrent enrichment calls read the same KV usage value, perform provider work,
and increment later with another read/write. They can exceed the configured
workspace-period cap and lose increments.

## Intent

[CS.SYS.BILL-R10](../02-system/08-billing-and-entitlements/requirements.md)
requires cost-bearing operations to enforce their workspace/period budgets.

## Implementation

[`x-enrichment/enricher.ts`](../../src/cf-worker/x-enrichment/enricher.ts) checks
before provider execution and records after it.
[`x-enrichment/usage.ts`](../../src/cf-worker/x-enrichment/usage.ts) implements
both operations through non-atomic KV get/put while LinkProcessor permits
concurrent AI work.

## Direction

update implementation

## Resolution Signal

Delete this delta when usage is atomically reserved before provider execution in
a serialized/transactional workspace owner, reconciled afterward, and concurrent
plus failed-reservation tests prove the configured cap cannot be exceeded.
