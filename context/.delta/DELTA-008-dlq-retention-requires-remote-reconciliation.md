# DELTA-008: DLQ recovery schedule lacks a verified production envelope

Status: open

## Divergence

The committed DLQ retry schedule is designed for roughly fourteen days, but
`wrangler.jsonc` cannot declare queue message retention and the production plan/
remote setting are unknown. Cloudflare currently fixes Workers Free retention at
24 hours and permits Paid retention up to fourteen days, so the intended retry
phase is conditional rather than established current behavior.

## Intent

[CS.SYS.ING-R08](../02-system/04-ingestion/requirements.md) and
[CS.OPS-R04](../03-operations/requirements.md) require retry schedule and
retention to agree.

## Implementation

[PR #84](https://github.com/bohdanbirdie/cloudstash/pull/84) explicitly lists
`wrangler queues update cloudstash-link-dlq --message-retention-period-secs
1209600` as a separate post-merge operation. The repository stores retry counts
and delays but no remote-state assertion for retention.

## Direction

update implementation

## Resolution Signal

Delete this delta when dated production plan and queue inspection selects one
explicit envelope: configure/prove Paid fourteen-day retention with drift
checking, or redesign retry scheduling and claims to fit Free's 24-hour window.
[CS-DQ5](../open-questions.md) tracks the blocked production fact.
