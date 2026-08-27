# Use the Workflow instance as the deletion job

Status: accepted

## Context

Account deletion spans D1, four Durable Objects, two KV namespaces, Stripe,
and delayed Queue messages. A separate D1 job row duplicated Cloudflare
Workflow lifecycle and introduced a second authority that could not be
committed atomically with Workflow creation.

## Evidence and Argument

- Better Auth must not remove identity until the Workflow instance exists.
- Cloudflare supports caller-defined instance IDs, idempotent batch creation,
  retained status inspection, and restart of errored or terminated instances.
- The personal workspace already provides a stable deletion identity.
- Delayed Queue work already has a deterministic owner Durable Object, whose
  generic terminal state survives content purge and can return a no-op.
- Target IDs must survive Better Auth cascades, so the Workflow payload carries
  the validated user, workspace, and optional Stripe subscription snapshot.

## Options

| Option                                          | Tradeoffs                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Workflow instance as job; terminal owner actors | One durable orchestrator and no Queue D1 read, but target IDs remain in bounded Workflow history.             |
| Separate D1 job and external fence              | Keeps Workflow payload opaque, but creates a second lifecycle authority and a permanent hot-path control row. |

## Decision

The `AccountDeletionWorkflow` instance is the durable deletion job. Use the
personal workspace ID as its deterministic instance ID and do not create an
`account_deletion_jobs` table. Before deletion, validate owner/workspace
consistency, construct the branded serializable target payload, and ensure the
instance. Rejoin active or complete instances, restart errored or terminated
instances, and fail closed for unknown status. Set per-instance retention on
creation: one day after success and three days after error. This bounds
accumulated orchestration state while keeping an errored instance available for
triage and restart, using durations supported by both Free and Paid plans.

Also fail closed when the personal organization contains another member.
Collaboration semantics remain unresolved, and an organization delete otherwise
cascades that other user's membership. Pending invitations and activity belong
to the organization and may be removed with it; sessions only lose their active
organization reference. The organization cascade must not reach users,
user-owned authentication/OAuth rows, other organizations, or global settings.
Repeat the no-other-member condition inside the organization `DELETE` itself so
a join racing the Workflow cannot pass an earlier check and then be cascaded.
User-owned auth and OAuth rows still cascade with the identity, but invitation
and global invite-code creator references become null: those rows may be used by
other people and must not disappear merely because their creator leaves.

Keep lifecycle resilience local to deterministic owner Durable Objects without
exposing deletion state to their business APIs. SyncBackend, LinkProcessor, and
Chat use generic terminal retirement; source-backed X reconciliation derives
empty state from the missing Better Auth account. Queue consumers route delayed
messages to the LinkProcessor owner and acknowledge retired no-ops. Use the
organization foreign key to cascade D1 activity rows and reject late orphan
activity writes.

Terminal retirement writes its opaque marker before attempting graceful
cleanup, then wipes storage while restoring only that marker. SyncBackend's
marker check belongs in LiveStore's serialized pre-append section; no Worker
gate can close the race once a push is already in flight. Chat uses its native
turn cancellation and request abort signal in addition to the durable marker.
Cloudflare `ctx.abort()` and Agent `destroy()` do not replace this protocol:
the former makes the retirement RPC fail uncatchably, while the latter removes
the marker and permits a later same-name actor to start empty. Retirement state
is monotonic across awaited reads. Chat serializes new fetch/WebSocket intake
against retirement, while LinkProcessor removes an alarm if a digest invocation
resumes late and rearms it after retirement.
