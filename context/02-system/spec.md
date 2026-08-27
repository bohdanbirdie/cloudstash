# System — Spec

This document specifies the top-level Cloudstash system. It builds on
[requirements.md](./requirements.md); child nodes own details.

## Status

Active.

## Architecture

```text
                         Cloudflare Worker
        ┌─────────────────────────────────────────────────────┐
        │ static app/landing │ Hono API │ auth │ queue consumer│
        └──────────┬─────────┴────┬─────┴──────┴──────┬────────┘
                   │              │                   │
         browser/extension       D1             Cloudflare Queue
          LiveStore clients  control plane             │
                   │                                  ▼
                   ├──── WebSocket ─────► SyncBackendDO (per workspace)
                   │                         ▲       ▲
                   │                         │       │
                   └─────────────────────────┘       │ LiveStore
                                             LinkProcessorDO
                                                   │
                              metadata/content/AI ──┘

        ChatAgentDO (per workspace) ─ LiveStore ───┘
        XBookmarkSyncDO (per user) ─ Queue
        AccountDeletionWorkflow ─ D1/KV/all relevant DOs
```

## Runtime Surfaces

The Worker serves prerendered/public assets and the SPA, routes Hono APIs,
authenticates LiveStore sync, routes Agents SDK WebSockets, and consumes the
main and dead-letter queues. `run_worker_first` sends `/`, `/sync*`, `/api/*`,
and `/agents/*` through Worker code.

Stateful classes:

| Class                     | Identity     | Owns                                                                  |
| ------------------------- | ------------ | --------------------------------------------------------------------- |
| `SyncBackendDO`           | workspace ID | Canonical synchronized eventlog and live distribution                 |
| `LinkProcessorDO`         | workspace ID | Server-side LiveStore replica, processing subscriptions, digest alarm |
| `ChatAgentDO`             | workspace ID | Chat messages, token usage, server-side LiveStore replica             |
| `XBookmarkSyncDO`         | user ID      | X watermark/status and polling alarm                                  |
| `AccountDeletionWorkflow` | workspace ID | Durable deletion job with independently retried multi-store steps     |

## Subsystem Composition

- [Data](./01-data/) declares the control/content split and event model.
- [Auth and tenancy](./02-auth-and-tenancy/) authorizes workspaces and
  integration identities.
- [Sync](./03-sync/) carries workspace history between all clients.
- [Ingestion](./04-ingestion/) normalizes external capture into link events.
- [Link processing](./05-link-processing/) enriches links through more events.
- [Retrieval and agent](./06-retrieval-and-agent/) exposes local search, public
  reads, export, and AI tools.
- [Integrations](./07-integrations/) maps external products to authorized
  capture/retrieval contracts.
- [Billing](./08-billing-and-entitlements/) turns payment/admin state into
  capabilities.
- [Account lifecycle](./09-account-lifecycle/) spans signup through hard
  deletion.
- [Verification](./10-verification/) checks pure logic, data flows, runtime
  behavior, and build provenance.

## Effect Boundary

Worker domain operations use Effect for dependency injection, typed failures,
structured logs, and tracing. `AppLayerLive` composes D1, Better Auth, billing,
settings, deletion runtime, and Cloudflare tracing. Hono/Queue/DO entry points
bridge Promise-based platform APIs into one top-level Effect. The deletion
Workflow keeps native `step.do` sequencing and runs each activity through one
invocation-scoped Effect runtime; unexpected defects fail closed and are logged.
