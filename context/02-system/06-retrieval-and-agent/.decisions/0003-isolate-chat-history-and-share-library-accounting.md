# Isolate chat history and share library accounting

Status: accepted

## Context

Cloudstash needs multiple conversations without recreating the removed
per-chat LiveStore client. It also needs one spending limit per library and a
bounded model context that does not visibly erase a user's transcript.

## Evidence and Argument

- Stable `AIChatAgent` storage represents one flat history per named actor.
- `LinkProcessorDO` already owns the canonical server-side library replica and
  is a serialized workspace boundary suitable for a shared spend ledger.
- A metadata-only registry in its key-value storage does not initialize the
  LiveStore client; an E2E probe verifies that session listing leaves the
  LiveStore `sessionId` absent.
- Cloudflare's richer Session API remains experimental. Adopting it only for
  conversation trees would add an unstable abstraction to a small chat surface.
- Retaining the full transcript for display while privately summarizing its old
  prefix keeps the user experience continuous and the provider context bounded.

## Options

| Option                                                   | Tradeoff                                                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| One workspace chat forever                               | Minimal lifecycle code, but no separate topics and `/clear` destroys history.                                     |
| Store chat rows in D1                                    | Central querying is easy, but duplicates Agents SDK persistence and adds schema/load.                             |
| Use experimental Agents sessions                         | Rich memory primitives, but couples production chat to an unstable API.                                           |
| One actor per conversation plus a LinkProcessor registry | Uses stable actors, isolates histories, avoids another materialized library, and adds a small lifecycle registry. |

## Decision

Keep the original workspace-named chat as the default and create one named
`ChatAgentDO` for each additional conversation. Store bounded metadata and the
single monthly usage ledger in the workspace `LinkProcessorDO`. Load registry
metadata eagerly and selected message history on demand. Compact model context
inside each chat with a private rolling summary while preserving its full UI
history. Before a model run, read the settled monthly spend and deny work at the
private limit. After completion, append one idempotent settlement and update the
monthly aggregate from OpenRouter's actual reported cost.

## Consequences

- Parallel conversations share one allowance and one settlement boundary.
- Chat listing does not create or materialize a LiveStore client.
- Existing message history requires no migration. The old token ledger is not
  converted because doing so would reintroduce model-price assumptions; the
  settled-cost ledger starts fresh once at rollout.
- Account deletion must retire every registered chat before removing its
  registry owner.
- Conversation search, cross-session memory, and richer trees remain future
  product decisions rather than implicit behavior.
- There is intentionally no in-flight reservation. Two rare overlapping short
  runs may both start below the limit and settle slightly above it; this keeps
  the hot path to one preflight read and one atomic settlement. A provider-side
  account cap remains the emergency backstop. Missing cost metadata is logged
  and never guessed from hard-coded model prices.
