# DELTA-014: OpenRouter AI processing is incompletely disclosed

Status: open

## Divergence

Plus weekly digests send saved-link titles, URLs, tags, and summaries to an
OpenRouter-hosted Gemini model. Pro X enrichment sends URL, author, bookmarked/
quoted/thread text, and existing tags through OpenRouter. Privacy and terms say
OpenRouter/Gemini is used only for Pro chat and that Free/Plus never use it.

## Intent

[CS-R09 and CS-R17](../requirements.md) require processor and transmitted-field
disclosure before Vault content leaves Cloudflare.

## Implementation

[`weekly-digest/generator.ts`](../../src/cf-worker/weekly-digest/generator.ts)
formats and sends digest fields, while
[`x-enrichment/generator.ts`](../../src/cf-worker/x-enrichment/generator.ts)
formats X/thread content for OpenRouter. [`privacy.tsx`](../../src/routes/privacy.tsx)
and [`terms.tsx`](../../src/routes/terms.tsx) scope that processor to Pro chat.

## Direction

update implementation

## Resolution Signal

Delete this delta when every OpenRouter path is covered by privacy/terms/plan
surfaces with affected tiers, transmitted field sets, purpose, retention/
training terms, and opt-out/deletion behavior—or the paths move to a processor
covered by the approved promises.
