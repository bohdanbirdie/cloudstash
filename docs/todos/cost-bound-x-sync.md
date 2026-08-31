# Cost-bound exact X bookmark recovery

## Delivered

- Request one bookmark per provider page and stop at any of 16 recent durable
  checkpoints.
- Persist pagination and discovered payloads when a walk exceeds 25 requests in
  one alarm.
- Enforce the plan-defined monthly imported-bookmark allowance in the
  workspace-owned `LinkProcessorDO`.
- Preserve unfinished work across queue failures, allowance exhaustion, actor
  eviction, and monthly reset.
- Apply a separate provider-read safety ceiling without exposing provider
  economics in product copy or configuration.

The durable contract and tradeoffs live in integration decision 0003.
