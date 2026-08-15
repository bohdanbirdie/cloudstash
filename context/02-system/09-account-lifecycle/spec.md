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

The app/preflight path keeps unapproved users on the pending flow. The primary
`/sync` validator currently checks only session and active-workspace equality,
not approval or a current membership row; this authorization divergence is
tracked by
[DELTA-011](../../.delta/DELTA-011-primary-sync-authorization-is-weaker-than-preflight.md).
Admin member management can approve users; viewer
permissions cannot mutate membership.

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
  → purge LinkProcessor (also erases the marker)
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

Current explicit purge targets are LinkProcessorDO storage/client state,
SyncBackendDO eventlog, ChatAgentDO messages/usage/client state, Telegram
forward/reverse mappings, XBookmarkSyncDO alarm/storage/account link, and the D1
organization/control rows reached by cascade. There is no Stripe cancellation
step. D1 activity and generic verification rows have no applicable deletion
step, and Workflow payload/history retains raw IDs under platform lifecycle.
Enrichment KV, Analytics Engine, retained Queue/DLQ messages, and browser/
extension residue also have no complete server-side purge treatment.

The current implementation both purges LinkProcessorDO before SyncBackendDO and
erases the intake tombstone during `deleteAll()`. A late reverse-RPC delivery or
retained Queue message can therefore reconstruct content. These races and the
incomplete storage inventory are tracked by
[DELTA-003](../../.delta/DELTA-003-account-deletion-order-can-rehydrate-client.md)
and [DELTA-019](../../.delta/DELTA-019-deletion-target-failures-and-surfaces-are-incomplete.md). The target design must
fence intake outside purged storage, disable authoritative sources before client
purge, propagate every target failure, and document bounded retention for
surfaces that cannot be selectively erased.
