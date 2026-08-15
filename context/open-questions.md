# Cloudstash — Open Questions

- **CS-DQ1 Shared-workspace product semantics.** The implementation supports
  organizations, membership, and invitations, but the product is positioned as
  a personal Vault and account deletion assumes a solo organization. Should
  multi-member workspaces be a supported product contract or only an internal
  tenancy capability? Blocked on a product decision and deletion/ownership
  review.
- **CS-DQ2 Durability-timeout semantics.** The server-side processing durability
  barrier waits up to ten seconds and then preserves availability by returning
  after a warning. Should timeout instead reject so the Queue retries and a
  successful processor RPC strictly proves backend persistence? Blocked on
  production latency/failure evidence and a poison-message strategy. See
  [the ingestion spec](./02-system/04-ingestion/spec.md).
- **CS-DQ5 Production Queue recovery envelope.** Is production on a Workers
  plan/configuration that permits the intended fourteen-day DLQ window, or must
  retry policy fit Free's fixed 24-hour retention? Blocked on authenticated
  inspection of the production plan and both queue retention settings. Resolve
  by recording dated evidence and promoting the chosen envelope into operations
  requirements/configuration; until then DELTA-008 records only unverified
  remote alignment.
- **CS-DQ3 Initial sync readiness.** A fresh or large local replica can render
  before its full workspace history arrives, which is confusing at current
  Vault sizes. What readiness state should block or qualify the initial app
  view? Blocked on UX choice and measurements tracked in
  [initial-sync-blocking](../docs/todos/initial-sync-blocking.md).
- **CS-DQ4 Collaboration between chat histories and workspace data.** The
  current system has one chat Durable Object per workspace. The desired
  multi-chat shape and ownership of the shared LiveStore client remain open and
  are explored in [multi-chat architecture](../docs/todos/multi-chat-architecture.md).
  Blocked on choosing thread ownership, deletion/export semantics, and one
  shared-client topology. Resolve when an accepted decision answers those three
  points and names the migration path from the single workspace chat.
