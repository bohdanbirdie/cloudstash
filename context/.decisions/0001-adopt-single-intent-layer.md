# Adopt a single hierarchical Intent layer

Status: accepted

## Context

Cloudstash's durable product and system knowledge is spread across `SPEC.md`,
README, agent instructions, architecture and feature docs, incident reports,
todos, PR descriptions, landing copy, legal copy, source comments, and the
maintainer's memory. Those surfaces have different lifecycles and already make
contradictory claims, so a reader cannot tell which statement is authoritative.

## Evidence and Argument

- The maintainer explicitly requested adoption after using the same model while
  contributing to LiveStore and finding that it worked well in practice.
- [LiveStore PR #1406](https://github.com/livestorejs/livestore/pull/1406)
  demonstrates the model at repository scale: a hierarchical tree, explicit
  precedence, decisions, deltas, and deterministic enforcement.
- Cloudstash's current drift is concrete, not hypothetical: `SPEC.md` describes
  old packages and future features that shipped; feature docs describe replaced
  billing/auth models; landing and legal copy include unshipped or stale claims.
- Cloudstash has distinct product, data, sync, ingestion, processing, billing,
  integration, lifecycle, operations, and delivery contracts, so a single flat
  specification no longer has a stable ownership boundary.

## Options

| Option                                                                                     | Tradeoffs                                                                                                                   |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Keep the existing documentation surfaces with informal precedence                          | Lowest migration cost, but preserves ambiguity, duplication, and agent-dependent knowledge.                                 |
| Replace `SPEC.md` with one canonical flat design document                                  | Establishes authority cheaply, but grows into another mixed-responsibility document and cannot localize decisions or drift. |
| Adopt a hierarchical Intent layer at `context/` with derived docs and deterministic checks | Adds maintenance and an initial migration, but gives every durable fact one owner and scales by subsystem.                  |

## Decision

Adopt the hierarchical Intent layer rooted at `context/`. It is the only
always-current durable intent source. Keep README for onboarding, docs for
teaching/history/planning, and agent files for procedure; require those surfaces
to reference rather than duplicate Intent. Add narrow deterministic enforcement
using the repository's existing TypeScript/Vitest toolchain.

## Consequences

- Existing docs are not deleted in the adoption change; their authority drift is
  explicit in `context/.delta/` and can be reconciled incrementally.
- Behavior or contract changes update the owning Intent node in the same PR.
- The Cloudstash checker scans only `context/`; `vendor/livestore/context/` is a
  separate upstream corpus.
