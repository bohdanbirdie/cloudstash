# Cloudstash — Intuition

_For: contributors and coding agents · Assumes: full-stack web application
experience · Covers: the whole product and the Intent map_

## The idea

Cloudstash turns a URL into a durable, searchable item in a private library.
Saving is the foreground action; fetching, summarizing, tagging, notifying, and
syncing are coordinated background consequences. A user should never have to
keep the web app open for server-originated work to finish.

```text
web / extension          REST / MCP          Telegram / Raycast / X
  │ local commit             │ RPC                       │ queue
  ▼                          └──────────┬────────────────┘
local LiveStore client ───────► SyncBackendDO ◄──► LinkProcessorDO
  │ synchronous reads                │              link operations,
  ▼                                  │              metadata + AI events
React UI ◄───────────────────────────┘
```

Workspace content follows one model: immutable events are synchronized and
materialized into local SQLite state. D1 is a different plane: it owns accounts,
membership, sessions, billing, invites, settings, and aggregate activity—not
the user's library.

A workspace is the alignment boundary. Its organization ID is also its LiveStore
`storeId` and names the workspace-scoped sync and processing/link-operation
Durable Objects. Chat conversations have independent actor names but are
registered under, authorized through, and billed to that same workspace. This
makes tenancy, synchronization, billing, and background processing speak the
same identity without giving each chat another materialized library.

## Read the tree

- [`01-product/`](./01-product/) — experience, positioning, privacy, and plans.
- [`02-system/`](./02-system/) — data, authentication, sync, intake,
  processing, retrieval, integrations, billing, lifecycle, and verification.
- [`03-operations/`](./03-operations/) — runtime resources, resilience,
  observability, capacity, and recovery.
- [`04-delivery/`](./04-delivery/) — repository composition, builds, releases,
  migrations, and dependency provenance.

Formal constraints live in each node's `requirements.md`; current shape lives
in `spec.md`; consequential rationale lives in `.decisions/`; confirmed drift
lives in `.delta/`. Plans remain in `docs/kanban.md` and `docs/todos/`, outside
the durable layer.
