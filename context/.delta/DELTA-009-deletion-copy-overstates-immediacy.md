# DELTA-009: Deletion copy overstates synchronous erasure

Status: open

## Divergence

The landing FAQ says the archive and summaries are wiped immediately when the
user deletes the account. The implementation starts a durable multi-step
Workflow before deleting the auth user; content purges normally complete later
and can retry after failures.

## Intent

[CS.PROD-R09](../01-product/requirements.md) requires accurate deletion claims,
and [CS.SYS.LIFE-R04 through CS.SYS.LIFE-R10](../02-system/09-account-lifecycle/requirements.md)
define durable asynchronous deletion.

## Implementation

[`faq.tsx`](../../src/components/landing/faq.tsx) and SEO/terms surfaces use
immediate-wipe/no-copy language. The more detailed
[`privacy.tsx`](../../src/routes/privacy.tsx) says typically within minutes and
up to thirty days for records/backups, but the repository does not establish a
backup-removal mechanism or thirty-day guarantee. The executable orchestration
is [`account-deletion/workflow.ts`](../../src/cf-worker/account-deletion/workflow.ts).

## Direction

update implementation

## Resolution Signal

Delete this delta when all product/legal deletion copy consistently distinguishes
immediate access revocation/workflow initiation from asynchronous retried purge
and states one reviewed retention promise.
