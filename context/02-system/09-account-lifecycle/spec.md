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
  → resolve user→workspace
  → ensure AccountDeletionWorkflow(workspaceId)
  → Better Auth removes user/auth rows

Workflow
  → mark LinkProcessor deleting (marker in the same DO storage)
  → purge LinkProcessor and retain its deletion marker
  → purge SyncBackend, chat, Telegram, and X state
  → delete organization (FK cascade)
```

Preparation currently converts a missing personal organization, missing
membership, or non-owner membership into a warning and returns `null`, allowing
Better Auth to delete the user without starting the Workflow. This violates the
fail-loud requirement; see
[DELTA-035](../../.delta/DELTA-035-deletion-preparation-skips-purge-on-inconsistent-tenancy.md).

`ensureWorkflow` reuses active instances, restarts terminal retained instances,
and creates when no instance is found. Every step is configured with five total
attempts, ten-second base exponential backoff, and one-minute timeout. Most
failures reject the step so Cloudflare Workflows retains error state and retry
evidence; X disconnect currently swallows alarm/storage deletion failures.

Current explicit purge targets are LinkProcessorDO link-operation/processing
storage and client state, SyncBackendDO eventlog, ChatAgentDO messages/usage/
client state, Telegram
forward/reverse mappings, XBookmarkSyncDO alarm/storage/account link, and the D1
organization/control rows reached by cascade. There is no Stripe cancellation
step. D1 activity and generic verification rows have no applicable deletion
step, and Workflow payload/history retains raw IDs under platform lifecycle.
Enrichment KV, Analytics Engine, retained Queue/DLQ messages, and browser/
extension residue also have no complete server-side purge treatment.

`LinkProcessorDO.purgeAll` clears its LiveStore state and rewrites the
non-personal deletion marker before accepting another request. Link-operation
RPCs, Queue intake, reverse sync, fetch wake-ups, and digest entry points reject
the marker after eviction. Canonical REST/MCP link operations also invalidate
late store creation and recheck their generation at repository commits.
Pre-existing processing, digest, ingestion, and notification work lacks the same
commit fence or drain and can still outlive the purge. This residual race and
the incomplete storage inventory are tracked by
[DELTA-003](../../.delta/DELTA-003-account-deletion-order-can-rehydrate-client.md)
and [DELTA-019](../../.delta/DELTA-019-deletion-target-failures-and-surfaces-are-incomplete.md). The target design must
invalidate or drain those remaining operations before client purge, propagate
every target failure, and document bounded retention for surfaces that cannot
be selectively erased.
