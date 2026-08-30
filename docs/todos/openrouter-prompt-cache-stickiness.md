# Use OpenRouter prompt caching deliberately

## Goal

Increase reuse of stable Assistant prefixes through OpenRouter's provider cache
without adding application cache storage or cache invalidation logic.

## Scope

- Send one stable opaque OpenRouter session identifier per Cloudstash chat.
- Keep the system prompt, tool order, names, descriptions, and schemas stable
  across turns.
- Record cache-read tokens, cache-write tokens, reasoning tokens, and
  provider-reported cost per completed generation.
- Compare cache-hit ratio and cost per successful turn before considering any
  explicit cache controls.

## Non-goals

- No custom prompt cache.
- No whole-response cache.
- No explicit cache breakpoints until measured evidence justifies them.

## Decision

- Use the conversation Durable Object ID as one stable opaque OpenRouter
  `session_id` for both Assistant turns and private compaction.
- Request detailed provider usage explicitly.
- Aggregate and log per-generation input, output, cache-read, cache-write,
  reasoning-token, and provider-cost signals.
- Keep OpenRouter/OpenAI responsible for cache storage and invalidation. Do not
  add application persistence or explicit breakpoints before telemetry shows a
  material missed opportunity.
