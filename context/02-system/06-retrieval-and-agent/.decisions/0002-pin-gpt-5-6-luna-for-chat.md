# Pin GPT-5.6 Luna for OpenRouter features

Status: accepted

## Context

Cloudstash needs a predictable OpenRouter model for chat, weekly digests, and X
enrichment. Chat additionally needs reliable tool use, compact answers, low
latency, and a predictable monthly per-workspace budget. Keeping separate
Gemini models for the other two small generation jobs adds model drift without
a demonstrated product benefit.

## Evidence and Argument

- A bounded local evaluation compared Gemini 3.7 Flash and GPT-5.6 Luna across
  eight representative chat tasks, twice each. Both passed all 16 checks.
- GPT-5.6 Luna produced a lower median answer length (9 words versus 13.5),
  lower median latency (2,157 ms versus 3,378 ms), and lower measured cost
  ($0.00498 versus $0.02156 across the run).
- [OpenRouter lists GPT-5.6 Luna](https://openrouter.ai/openai/gpt-5.6-luna-20260709)
  at $0.20 per million input tokens and $1.20 per million output tokens. Those
  rates are part of the budget calculation and must change with the model
  rather than drifting independently.

## Options

| Option                    | Tradeoff                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| Keep Gemini 2.5 Flash     | Preserves the old budget assumptions, but was not the evaluated current candidate.                |
| Use Gemini 3.7 Flash      | Passed every task, but was slower, more verbose, and more expensive in the representative sample. |
| Pin GPT-5.6 Luna          | Best fit for compact chat and current cost; requires explicit OpenAI disclosure.                  |
| Add dynamic model routing | Could optimize per request later, but adds policy, testing, attribution, and pricing complexity.  |

## Decision

Use OpenRouter model `openai/gpt-5.6-luna-20260709` for Cloudstash chat, weekly
digests, and X enrichment. Keep one shared `OPENROUTER_MODEL_ID`; key chat's
budget pricing by that same constant. Do not retain the one-off evaluation
runner or its raw output in the product repository.

## Consequences

- Chat answers target compact, tool-grounded responses from one pinned model.
- Weekly digest and X enrichment output schemas and prompts remain
  feature-specific while sharing the runtime model.
- Privacy and Terms disclose OpenAI as the model provider for all OpenRouter
  features.
- A future model change must update runtime selection, pricing, tests, Intent,
  and legal provider disclosure together.
