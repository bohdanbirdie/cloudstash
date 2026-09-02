# Enforce one workspace plan matrix at existing owners

Status: accepted

## Context

Cloudstash had separate Assistant, X-import, and X-enrichment allowances, while
saved links, ordinary AI summaries, and external API work had no complete shared
plan policy. Product copy, runtime capability defaults, and Settings could
therefore describe different practical limits. The maintainer confirmed the
Free, Plus, and Pro allowance matrix during the 2026-08-31 implementation.

## Evidence and Argument

- LinkProcessorDO already serializes workspace processing and owns the durable
  counters for Assistant and X work.
- A separate billing coordinator would add another lifecycle and failure
  boundary without improving workspace-level consistency.
- Browser and extension saves are local-first; rejecting synchronized events
  after a local commit would turn capacity enforcement into apparent data loss.
- Provider-backed work can fail closed before cost is incurred while preserving
  the saved link and metadata.
- Public credits and operation counts are stable product units; provider prices,
  spend thresholds, and margin assumptions are private configuration.

## Options

| Option                                               | Tradeoffs                                                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Independent counters at each HTTP/provider handler   | Simple locally, but races across API/MCP and duplicates reset/capability logic.                                                    |
| A dedicated usage Durable Object                     | Globally atomic, but adds an actor, bindings, lifecycle cleanup, and RPC hops per workspace.                                       |
| Reuse LinkProcessorDO and code-defined tier defaults | Atomic for cost-bearing work at the existing workspace owner; local-first browser capacity remains a deliberate best-effort guard. |

## Decision

Declare every public allowance in `TIER_CAPABILITIES` and use the workspace's
subscription-aligned monthly window. Reserve AI summary, X enrichment, and the
combined REST/MCP operation budget transactionally in LinkProcessorDO storage.
Serialize server-originated active-link admission there as well. Web and Chrome
clients check known local capacity before committing, but keep offline saves
when entitlement state cannot be verified. Show public remaining units and one
reset in Settings; never expose provider spend or internal margin policy.
