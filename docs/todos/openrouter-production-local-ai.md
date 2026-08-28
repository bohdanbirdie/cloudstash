# Standardize production AI on OpenRouter with a cost-free local path

## Outcome

Use OpenRouter as the single production model-provider boundary for regular
summaries, X enrichment, weekly digests, and chat. Local development must not
spend OpenRouter credits unless the developer explicitly opts in.

Cloudflare AI Gateway is not a replacement provider: it can proxy OpenRouter
and add analytics, rate limits, caching, retries, or fallback controls, while
OpenRouter still supplies the model routing and requires an OpenRouter token.
Do not add AI Gateway as another required production dependency without a
measured operational need. If it is added later, reconcile its prompt/response
logging and retention with `CORE-02` first.

## Current split

- Regular link summaries use Workers AI through the `AI` binding.
- X enrichment, weekly digests, and chat use OpenRouter.
- Tests provide fakes at the Effect service boundary.

## Scope

- Introduce or consolidate one Effect-owned inference-provider boundary rather
  than scattering environment switches through feature code.
- Route every production LLM feature through OpenRouter, including regular link
  summaries.
- Preserve feature-specific model selection, structured-output validation,
  timeouts, fallback behavior, and recorded model attribution.
- Make local development default to a deterministic fake, local model, or the
  existing Workers AI path without requiring an OpenRouter key or spending
  OpenRouter credits.
- Require an explicit local opt-in before calling OpenRouter.
- Keep unit and Worker tests hermetic and provider-free.

## Acceptance criteria

- Production has one documented provider boundary and no feature silently uses
  Workers AI instead of OpenRouter.
- Local startup and normal feature testing work without an OpenRouter key and
  cannot accidentally incur OpenRouter spend.
- An explicit development override can exercise the real OpenRouter path.
- Provider failures retain bounded, typed behavior and do not lose saved links.
- Privacy and legal copy accurately name every processor used by each mode.
