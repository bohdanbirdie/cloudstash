# Complete reliable account deletion

## Current state

The central deletion path is implemented. A Cloudflare Workflow instance is
the deletion job; there is no parallel D1 job or intake-fence table. The
personal workspace ID is its deterministic instance ID, and the instance is
retained for one day after success or three days after error.

Before Better Auth removes identity, preparation now:

- validates the user, personal workspace, and sole-owner membership invariant;
- snapshots branded user, workspace, and optional Stripe subscription IDs;
- creates or rejoins the deterministic Workflow instance;
- blocks identity deletion for inconsistent tenancy, Workflow API failure, or
  an unknown instance status.

The Workflow waits for the user row to disappear, cancels Stripe, retires the
canonical SyncBackend before its LinkProcessor and Chat replicas, then removes
X, Telegram, enrichment KV, and organization data. Each
named Cloudflare step runs one Effect activity and rejects on failure so
Cloudflare owns durable retries and timeout handling.

SyncBackend, LinkProcessor, and Chat keep opaque terminal actor markers; they do
not know why they were retired. Retirement persists the marker before graceful
cleanup and finally wipes all other storage. LinkProcessor and Chat inject
revision-guarded commit capabilities at their normal write boundaries rather
than threading deletion predicates through business code; Chat also cancels
native queued/active turns. X carries no marker and reconciles its missing
Better Auth account into empty state. Queue/DLQ messages route to the
deterministic LinkProcessor and acknowledge a retired no-op. D1 activity rows
use the organization foreign key with `ON DELETE CASCADE`, so late orphan writes
are rejected.

Deletion fails closed when the personal workspace has another member. The D1
organization cascade is intentionally limited to that workspace's memberships,
invitations, and activity rows; active-session references become null rather
than deleting those sessions. The no-other-member condition is part of the
organization `DELETE`, so a concurrent join cannot be caught by the cascade.
User deletion nulls creator references on organization invitations and global
invite codes instead of deleting access another person may still need.

The accepted rationale and current contract live in
[`decision 0001`](../../context/02-system/09-account-lifecycle/.decisions/0001-use-workflow-instance-as-deletion-job.md)
and the
[`account-lifecycle spec`](../../context/02-system/09-account-lifecycle/spec.md).

## Remaining release work

- Define and implement digest/provider-notification cancellation so an
  already-started side effect cannot notify after deletion.
- Inventory generic verification rows and decide which are attributable and
  selectively purgeable.
- Document Analytics Engine, logs/traces, Stripe records, and other
  non-selectively erasable provider retention with reviewed product/legal copy.
- Define browser and extension residue semantics, including offline devices
  that cannot be remotely erased.
- Add broader seeded failure-injection E2E for active sockets, delayed
  Queue/DLQ delivery, suspended external calls, and every owned store/provider.
- Reconcile production Queue retention with the delayed-message threat model
  tracked in DELTA-008.

## Acceptance evidence still required

- Mid-workflow target failures retry and resume without skipping a target.
- Late or replayed intake cannot reconstruct a purged workspace.
- Active sync/chat work cannot commit after the deletion fence is installed.
- Authentication, API keys, sync, MCP, REST, and integrations remain denied
  after identity deletion.
- Product and privacy copy distinguish immediate access revocation, active
  purge, and bounded provider/platform retention without promising removal of
  every byte.

## Dependencies and risks

Tracks DELTA-003, DELTA-008, DELTA-009, DELTA-013, and DELTA-019. Legal sign-off
on provider-retention language remains a human action. Cloudflare Queue and
Analytics Engine retention may constrain the strongest supportable deletion
claim.
