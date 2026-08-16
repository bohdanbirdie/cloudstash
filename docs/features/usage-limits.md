# Usage limits

Cloudstash uses workspace-period budgets for cost-bearing AI operations. These
budgets do not limit how many links a workspace may save.

## Current implementation

- Pro chat uses the configured monthly budget from `monthlyChatBudgetUsd` in
  `src/lib/plan.ts`. `ChatAgentDO` atomically reserves estimated tokens in its
  monthly `usage:<period>` record before calling the provider, then reconciles
  actual prompt/completion usage. Budget lookup failure denies provider work.
- Eligible X content enrichment has a separate monthly workspace cap. Move its
  accounting to atomic reservation; see DELTA-024.
- Free currently has `aiSummary: false`. A bounded monthly Free allowance is
  planned but not implemented; see [[../todos/free-ai-summary-allowance]].
- There is no saved-link count cap for Free or paid workspaces.

## Product behavior

Budget exhaustion must preserve the accepted/saved link and avoid presenting a
provider or accounting failure as data loss. Each owning feature defines its
calm allowance-exhausted state and upgrade path.

## Authority

Executable defaults live in `src/lib/plan.ts`; workspace overrides are merged by
`Billing.capabilities`. This document is explanatory and must not be used as an
authorization source.
