# DELTA-006: Summary-length product copy disagrees with the model contract

Status: open

## Divergence

Landing, FAQ, SEO, and privacy copy repeatedly promise a “two-paragraph” summary,
while the implemented structured-output schema requests a two-to-three-sentence
summary with a 600-character maximum. Plan and benefit copy also promises a
summary on every save although extraction/model failure intentionally preserves
a save without a summary.

## Intent

[CS.PROD-R07](../01-product/requirements.md) promises concise AI triage without
fixing a false paragraph count, and [CS.PROD-R10](../01-product/requirements.md)
requires availability/output claims to match reality.

## Implementation

- [`generate-summary.ts`](../../src/cf-worker/link-processor/generate-summary.ts)
  defines the two-to-three-sentence output schema.
- [`pitch.tsx`](../../src/components/landing/pitch.tsx),
  [`benefits.tsx`](../../src/components/landing/benefits.tsx), and
  [`privacy.tsx`](../../src/routes/privacy.tsx) use two-paragraph language.

## Direction

update implementation

## Resolution Signal

Delete this delta when deployed copy describes the two-to-three-sentence,
processable-content contract without guaranteeing a summary for failed or
unsupported pages. A different output shape requires a separately reviewed
product requirement and model/test change.
