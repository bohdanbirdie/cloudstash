# Account Lifecycle — Spec

This document specifies signup through hard deletion. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Signup and Approval

Google OAuth creates the user/account. A user-create hook reads the global
signup gate: absent/false means open and auto-approves; true leaves the user
pending administrator approval. Session creation resolves the first member row,
repairs an owner membership when the personal organization exists without one,
or creates `<name>'s Workspace` with stable user-derived slug. The organization
ID becomes `activeOrganizationId`.

The app path keeps unapproved users on the pending flow. Sync preflight and the
authoritative `/sync` validator share the same authorization decision: both
require the session's active workspace, current approval, current membership,
and equality with the requested workspace. Admin member management can approve
users; viewer permissions cannot mutate membership.

## Logout and Local State

The authenticated app shuts down its LiveStore store before identity transition.
The login route clears `livestore`-prefixed OPFS entries on mount so a later
identity does not reuse stale eventlog/state. Extension credentials and storage
have a separate explicit disconnect/revocation lifecycle.

## Account Deletion

Deletion has two phases:

```text
Better Auth beforeDelete
  → validate user→personal workspace sole-owner invariant (fail closed)
  → snapshot user/workspace/Stripe targets into a serializable payload
  → create or join AccountDeletionWorkflow(workspaceId)
  → Better Auth removes user/auth rows

Workflow
  → prove Better Auth's identity-row deletion committed
  → cancel Stripe subscription
  → retire LinkProcessor and Chat writers, then purge canonical SyncBackend
  → purge X, Telegram, and enrichment KV
  → conditionally delete unshared organization (D1 activity FK cascade)
  → complete as the durable deletion job
```

The Cloudflare Workflow instance is the deletion job; there is no parallel D1
orchestration row. Its deterministic ID is the personal workspace ID. The
validated payload contains branded user, workspace, and optional Stripe
subscription IDs because those rows may disappear before later steps run.
Preparation uses the idempotent batch-create API and then handles retained
instance status explicitly: active and complete instances rejoin, errored and
terminated instances restart, and unknown status blocks identity deletion. See
[decision 0001](./.decisions/0001-use-workflow-instance-as-deletion-job.md).
Each `createBatch` entry explicitly retains successful instances for one day
and errored instances for three days. The short success window limits
accumulated orchestration state while the longer error window preserves a
portable triage/restart opportunity on both Free and Paid plans.

The identity-disappearance poll uses ten retries with one-second base
exponential backoff; destructive activities use five retries with ten-second
base exponential backoff. All steps have a one-minute timeout. Effect failures
reject `step.do`, preserving Cloudflare retry/error semantics. Stripe
cancellation uses the workspace-keyed deletion identity as its idempotency
key; a resource-missing response means the subscription is already terminated
and does not block later purge steps. Explicit purge targets are
SyncBackendDO, LinkProcessorDO,
ChatAgentDO, XBookmarkSyncDO, Telegram mappings, workspace-keyed enrichment KV,
and organization-owned D1 rows reached by cascade.

Preparation refuses deletion when the personal organization contains another
member. Shared-workspace ownership and deletion semantics are unresolved, so
the safe behavior is to preserve both identities and the workspace rather than
let an owner delete another user's membership or shared content. At the final
D1 boundary, one conditional delete statement proves no other member exists and
then deletes the organization. Its cascade reaches only `member`, `invitation`,
and `activity_events` rows; `session.activeOrganizationId` is set to null. A
concurrent membership insert therefore prevents the delete or fails its foreign
key after the organization is gone—it cannot be silently removed by the
cascade. The cascade does not reach `user`, user-owned authentication/OAuth
rows, another organization, or global settings.

Better Auth's earlier user delete independently cascades the target's sessions,
accounts, API keys, OAuth clients/tokens/consents, and memberships. Organization
invitations and global invite codes are not the creator's owned data and may be
in use by other people, so their creator references use `ON DELETE SET NULL`
instead of deleting those rows.

The Workflow does not install a separate deletion state in the Worker or its
actors. `LinkProcessorDO` and `ChatAgentDO` expose the generic terminal
operation `retire`: close active connections/store handles, atomically persist
an opaque actor-retired marker before graceful cleanup, then coalesce a full
storage wipe with restoring that marker. The Workflow retires those server-side
LiveStore clients before `SyncBackendDO.purgeAll` closes remaining WebSockets
and wipes the canonical eventlog through public Durable Object APIs. The
identity row is already gone, so normal sync authorization rejects new browser
or extension connections. Cloudstash does not patch or inspect LiveStore
internals for deletion. LinkProcessor and Chat capture an internal store
revision around external I/O and expose guarded commit capabilities to
repositories, tools, digest persistence, and workspace operations; those
business services do not receive lifecycle predicates or deletion state. Chat
additionally cancels its native queued and active turns, passes the Agent
request abort signal into model streaming, and serializes new HTTP/WebSocket
intake against retirement at the Agent fetch boundary. In-memory retirement is
monotonic across awaited storage reads.

X is source-backed and has no retirement marker. `start`, `resume`, alarms, and
delayed reconciliation re-read the Better Auth X account from D1; a missing
account cancels the alarm and clears local state. `pause` is a no-op without an
existing local state, and every alarm reconciles again after external I/O so it
cannot leave rehydrated state after unlink/deletion. The Workflow shuts down
server-side LiveStore clients before wiping the canonical SyncBackend, so no
surviving client can reconnect and rehydrate the eventlog between purge steps.
Link Queue/DLQ deliveries to a retired processor are
acknowledged as successful no-ops. D1 activity rows reference the organization
with `ON DELETE CASCADE`, removing existing rows and rejecting late orphan
inserts after the organization is gone. A digest invocation that resumes after
retirement removes any alarm it attempted to rearm.

Digest/notification provider side effects, generic verification rows,
Analytics Engine retention, browser/extension copies, and provider/platform
retention still require explicit treatment. Those remaining gaps are tracked by
[DELTA-003](../../.delta/DELTA-003-account-deletion-order-can-rehydrate-client.md)
and
[DELTA-019](../../.delta/DELTA-019-deletion-target-failures-and-surfaces-are-incomplete.md).
