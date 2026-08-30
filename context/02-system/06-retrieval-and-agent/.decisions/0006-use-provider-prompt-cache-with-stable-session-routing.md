# Use provider prompt caching with stable session routing

Status: accepted

## Context

Assistant tool definitions, system instructions, and append-only conversation
history create a reusable prompt prefix. OpenRouter and its upstream provider
already support automatic prefix caching, but reuse depends on stable routing
and was not observable in Cloudstash.

## Evidence and Argument

The conversation Durable Object has one stable opaque ID and already owns the
model lifecycle. Reusing that ID as provider session metadata requires no new
storage. The AI SDK exposes cache-read, cache-write, reasoning, and total token
details while OpenRouter metadata remains authoritative for actual cost.

## Options

| Option                                      | Tradeoff                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| Rely on defaults without a session identity | No code, but routing and cache effectiveness remain opaque.                  |
| Build and invalidate an application cache   | Full control, but duplicates provider infrastructure and stores prompts.     |
| Add stable routing plus usage telemetry     | Enables automatic reuse and measurement with no cache lifecycle to maintain. |

## Decision

Send one stable opaque OpenRouter `session_id` per conversation for Assistant
and compaction calls. Explicitly request usage accounting and log aggregate
cache-read, cache-write, reasoning, input, output, and actual-cost signals per
completed generation. Keep provider caching implicit.

## Consequences

- Conversation turns are more likely to reuse the same upstream cache.
- Cache effectiveness can be measured before adding controls.
- No prompts, cache entries, or invalidation metadata are persisted by
  Cloudstash.
- Explicit cache breakpoints remain out of scope until production telemetry
  demonstrates a meaningful gap.
