# Usage Limits

Token-based usage limits per workspace to control costs. Resets monthly.

## How it works

1. Tokens are tracked in the `ChatAgentDO` using KV storage (`usage:YYYY-MM` key)
2. Before each LLM call, usage is checked against the workspace's budget
3. If over limit, a friendly message is returned instead of calling the LLM
4. Usage resets automatically on the 1st of each month (new key = zero usage)

## Budget

Default: **$0.50/month** (~675K tokens for Gemini 2.5 Flash)

Configurable per workspace via `OrgFeatures.monthlyTokenBudget` in the admin UI.

### Budget-to-token conversion

Uses a blended rate based on typical 4:1 input:output ratio:

```
blendedRate = (4 * inputPer1M + outputPer1M) / 5
tokenLimit = budget / blendedRate * 1_000_000
```

If the model changes, only the pricing map needs updating — dollar budgets stay meaningful.

## UI

- Progress bar in chat header shows usage percentage
- Turns red at 90%+ usage
- Updates in real-time via WebSocket state sync

## Testing

Unit tests in `src/cf-worker/__tests__/unit/usage.test.ts` cover `budgetToTokenLimit()` math.
