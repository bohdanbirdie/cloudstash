# Use a reactive per-workspace LiveStore client for link processing

Status: accepted

## Context

Enrichment must continue after a browser closes, react to browser and external
captures, write results into the same Vault, survive DO eviction, and avoid a
second mutable job database.

## Evidence and Argument

- The processor can derive work as links minus terminal processing state from
  its LiveStore replica.
- Browser `LinkCreated`, external `v2.LinkCreated`, and reprocess events all
  become the same reactive pending set.
- Persistent status events provide recovery and idempotency after eviction;
  process memory is only a concurrency optimization.
- [PR #25](https://github.com/bohdanbirdie/cloudstash/pull/25) removed a direct
  reprocess API because it raced the event path and could wedge sync.
- [PR #40](https://github.com/bohdanbirdie/cloudstash/pull/40) validates bounded
  concurrent processing and stateless notification progress over this model.

## Options

| Option                                                                                          | Tradeoffs                                                                                                                |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Process metadata/AI in the browser that saved the link                                          | Immediate context, but work dies with the tab and every client needs provider credentials/code.                          |
| Maintain a separate D1 jobs table and worker poller                                             | Familiar queue model, but duplicates link/status truth and requires cross-plane reconciliation.                          |
| Run one workspace-scoped Durable Object as a LiveStore client reacting to derived pending state | Reuses the content model and survives browser closure, but must manage DO eviction and client-sync durability carefully. |

## Decision

Use one LinkProcessorDO per workspace as an ordinary LiveStore client. Discover
work from materialized workspace state, persist lifecycle/results as events, and
use bounded in-memory concurrency only as a disposable optimization. Route
reprocess requests through events and use Queue only for durable external
intake, not as the enrichment source of truth.
