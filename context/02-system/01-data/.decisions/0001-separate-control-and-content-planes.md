# Separate control-plane and workspace-content storage

Status: accepted

## Context

Cloudstash needs relational identity/billing data and an offline-first,
replayable Vault. Putting both in one server database would make local reads a
cache of server state; putting identity and billing into each LiveStore eventlog
would complicate cross-workspace administration, OAuth, and subscriptions.

## Evidence and Argument

- Better Auth, Stripe, invites, settings, and aggregate activity are naturally
  relational and are implemented in D1.
- Links, tags, metadata, summaries, and reading state need synchronous local
  reads, offline commits, and multi-client convergence and are implemented as
  LiveStore events.
- `LinkProcessorDO` and `ChatAgentDO` already act as ordinary LiveStore clients,
  proving server-side work can participate without moving content into D1.
- The split is visible throughout [`db/schema.ts`](../../../../src/cf-worker/db/schema.ts)
  and [`livestore/schema.ts`](../../../../src/livestore/schema.ts).

## Options

| Option                                                            | Tradeoffs                                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Put all state in D1 and cache Vault rows on clients               | Simplifies server administration, but loses the eventlog-as-source model and requires custom offline/cache conflict machinery. |
| Put identity, billing, and Vault state in LiveStore               | Unifies storage, but makes cross-workspace control queries, OAuth plugin integration, and billing synchronization unnatural.   |
| Keep D1 as control plane and LiveStore as workspace content plane | Creates a non-transactional boundary and multi-store deletion work, but gives each data class the consistency model it needs.  |

## Decision

Use D1 for control-plane identity, tenancy, authorization, billing, settings,
and aggregate activity. Use one LiveStore history per workspace for user content.
Per-DO/KV/Queue state remains mechanism-owned and must declare its lifecycle.
No code may imply an atomic transaction across D1 and LiveStore; cross-plane
work uses idempotent orchestration and reconciliation.
