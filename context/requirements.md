# Cloudstash — Requirements

## Context

These are product-wide constraints. Child nodes refine the requirements for the
product, system, operations, and delivery surfaces. The current implementation
and existing documentation are evidence, not competing sources of durable
intent.

## Assumptions

- **CS-A01 Client-sized workspace:** One workspace's content remains small
  enough to maintain a complete local read model on each active client.
  - Validation: the LiveStore architecture and current production-scale tests,
    including the 1,400-link initial-sync investigation in
    [initial-sync-blocking](../docs/todos/initial-sync-blocking.md).
- **CS-A02 External content is unstable:** Linked pages may change, reject
  automated fetches, disappear, or return content that cannot be summarized.
  - Validation: typed fetch failure states in
    [`process-link.ts`](../src/cf-worker/link-processor/process-link.ts) and the
    failure UX tracked in [the kanban](../docs/kanban.md).
- **CS-A03 Workspace isolation:** A workspace is the unit of content ownership,
  synchronization, billing, and server-side processing.
  - Validation: organization-scoped authentication, `storeId`, Durable Object
    naming, and billing code.

## Constraints

- **CS-C01 Privacy and deletion:** Handling of personal data must satisfy the
  explicit guarantees in this tree and applicable deletion, access, and
  disclosure obligations. Published legal copy is a derived surface, not the
  authority that creates those guarantees.
- **CS-C02 Third-party boundaries:** OAuth providers, content hosts, AI
  providers, Stripe, Telegram, X, and extension stores may impose availability,
  rate, review, and data-handling constraints outside Cloudstash's control.
- **CS-C03 Event compatibility:** Deployed workspace events may be replayed for
  the lifetime of the Vault; incompatible event changes cannot invalidate
  existing histories.
- **CS-C04 Source license:** The repository is source-available under PolyForm
  Noncommercial 1.0.0; commercial operation requires a separate license.

## Acceptable Tradeoffs

- **CS-T01 Local replica cost:** Maintaining a full local workspace replica is
  accepted in exchange for synchronous local reads, offline use, and simple
  reactive UI.
- **CS-T02 Asynchronous enrichment:** Metadata, summaries, tag suggestions, and
  source notifications may arrive after the save is visible; capture must not
  wait for the full enrichment pipeline.
- **CS-T03 Paid capability surface:** Some capture paths and AI features are
  tier-gated so the free saving core can remain available without unbounded
  third-party cost.
- **CS-T04 Event history growth:** Append-only history and rebuildability are
  accepted in exchange for auditability, deterministic derivation, and sync.

## Requirements

### Must Preserve the User's Vault

- **CS-R01 Capture from multiple sources:** Authorized first-party and
  integration clients must converge on the same workspace Vault.
- **CS-R02 Local-first use:** Normal Vault reads and user mutations must work
  from local state without a network round-trip.
- **CS-R03 Eventual convergence:** Connected clients for a workspace must
  converge on the same accepted event history.
- **CS-R04 Save before enrich:** Failure or unavailability of metadata and AI
  processing must not erase an accepted link save.
- **CS-R05 Replayable workspace state:** Workspace content must be rebuildable
  from its durable history.

### Must Protect Boundaries

- **CS-R06 Workspace isolation:** A request, sync connection, integration key,
  agent, or processor must not read or mutate another workspace's content.
- **CS-R07 Server-authoritative access:** Authentication, permissions, and paid
  capability checks must be enforced server-side; client gates are UX only.
- **CS-R08 Data control:** Users must be able to export workspace content and
  initiate deletion of account-owned content across all storage surfaces.
- **CS-R09 Privacy accuracy:** Product and legal claims about collection,
  processors, analytics, retention, and AI use must match deployed behavior.
- **CS-R17 Processor disclosure:** Before Vault content is sent to an external
  AI provider, the owning product/legal surfaces must identify that provider,
  affected feature and tiers, transmitted fields, and purpose.
- **CS-R18 Tracking choice:** Tracking and advertising scripts must honor every
  opt-out signal the legal surface promises, including Global Privacy Control
  while that promise is published.
- **CS-R19 Telemetry minimization:** Operational logs, traces, and aggregate
  analytics must not retain full saved URLs, link identifiers, or stable user/
  workspace identifiers unless an explicitly reviewed purpose and retention
  rule is documented.
- **CS-R20 No model training:** Cloudstash must not use workspace links,
  summaries, chat messages, or derived content to train models, and must select
  processors/settings whose contractual handling does not repurpose submitted
  content for model training.
- **CS-R21 Durable-data minimization:** Event and integration source metadata
  must retain only fields required for replay, provenance, notification, or an
  explicitly reviewed product behavior.

### Must Remain Operable

- **CS-R10 Bounded background work:** External I/O and AI operations must have
  bounded concurrency and timeouts appropriate to the runtime.
- **CS-R11 Retry durable intake:** Transient infrastructure failure after
  external intake must be retried without relying on an active browser session.
- **CS-R12 Observable failure:** Durable Object, queue, sync, billing, and
  processing failures must produce structured evidence sufficient for triage.
- **CS-R13 Verification at boundaries:** Event compatibility, materialization,
  sync arrival, eviction recovery, authorization, and public API behavior must
  be covered at the lowest realistic boundary.

### Must Keep Intent Current

- **CS-R14 Single intent layer:** `context/` is the only always-current durable
  source for product and system intent.
- **CS-R15 Derived documentation:** README, architecture, feature, legal, and
  landing surfaces may teach or present the system but must not contradict the
  owning Intent node.
- **CS-R16 Explicit drift:** Confirmed divergence between this contract and
  implementation must be recorded in `.delta/` until reconciled.
