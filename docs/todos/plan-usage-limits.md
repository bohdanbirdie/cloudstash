# Define and enforce usage limits for every plan

## Goal

Create one explicit plan-by-plan limits matrix, then make executable plan
configuration, runtime enforcement, settings UI, and customer copy agree with
it. Limits should protect Cloudstash's operating envelope without making normal
usage feel precarious.

## Scope

- Decide whether each plan has an allowance or no practical limit for saved
  links, AI summaries, Assistant credits, enriched X summaries, digests, and
  other provider-backed or storage-growing work.
- Define the accounting unit and reset period for every bounded capability.
- Keep private provider cost and margin assumptions out of product copy and
  public configuration.
- Put each hard check at the operation's existing ownership boundary; do not
  add a new coordinator only to count usage.
- Specify calm behavior at exhaustion. Saving a link must not silently lose the
  user's link because optional enrichment or summarization is unavailable.
- Reuse the shared Settings usage surface for limits users need to understand.
- Reconcile narrower allowance tasks, including `CORE-04`, after the matrix is
  accepted so the board does not retain overlapping definitions.

## Acceptance criteria

- A reviewed matrix names every bounded capability, its allowance per plan,
  accounting unit, reset rule, and exhaustion behavior.
- Tier defaults are the executable source for public allowances; private
  economic thresholds remain environment-owned.
- Every bounded operation has concurrency-safe enforcement and tests at its
  authoritative owner.
- Settings shows relevant remaining allowance and reset information without
  exposing dollars, provider token prices, or Cloudstash margins.
- Pricing and product copy make no unlimited claim that the implementation does
  not honor.
