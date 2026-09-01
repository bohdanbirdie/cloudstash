# Bound summary prompt envelopes

Status: accepted

## Context

The basic and X summarizers included every existing workspace tag in their
prompts. That vocabulary grows independently of page content and can make one
save progressively more expensive without improving the short output.

## Evidence and Argument

The summary contract is at most 600 characters plus three short tag names, so a
384-token structured-output envelope retains headroom. Tag reuse is a hint to
the model; final matching still sees every local tag, so sending an unbounded
vocabulary is not required for correctness.

## Options

| Option                                    | Tradeoff                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| Send every tag and retain 512 tokens      | No selection policy, but prompt cost grows forever with workspace tags.  |
| Bound tags at 100 and basic output at 384 | Stable cost with enough room for the existing short structured contract. |

## Decision

Sort existing tags by name and expose at most 100 to both summarizers. Cap the
basic structured summary at 384 output tokens, which remains comfortably above
its 600-character summary plus three short tag fields. Keep X enrichment's
current output ceiling; its reasoning policy is a separate provider decision.

## Consequences

- Prompt size is bounded without a new store, cache, or query.
- Workspaces with more than 100 tags may mint or fuzzy-match a tag that was not
  present in the prompt; final matching still uses the complete local tag set.
- Alphabetical selection is stable and intentionally simple rather than adding
  usage-frequency accounting.
