# Make Assistant credits the primary chat usage guardrail

- Code: `AI-11`
- Priority: high
- Status: done with `AI-09`

## Goal

Treat the monthly Assistant allowance as the primary chat usage guardrail.
Users may use their included credits on whichever read or write tools help them,
without artificial per-tool restrictions whose only purpose is limiting usage.

## Current baseline

The multi-session implementation resolves one library allowance before each
model turn or continuation, then records actual OpenRouter cost in a shared
settled ledger. Destructive link archival still requires explicit AI SDK
approval because that is a safety boundary, not a billing boundary.

## Work

- Verify that every initial turn, tool continuation, and approved-tool
  continuation passes through the same settled-spend preflight.
- Settle actual provider-reported cost idempotently without hard-coded model
  prices. Accept a small possible overage from rare overlapping short calls.
- Review chat-only tool limits and keep only bounded-response, platform-safety,
  and destructive-action controls; do not use per-tool quotas as a substitute
  for the Assistant allowance.
- Present exhaustion and reset timing in calm user-facing language.
- Align reset timing with persisted Stripe item periods/billing anchors (and an
  explicit admin-grant anchor), carrying one window through each run.
- Preserve the same library-wide allowance when `AI-09` introduces multiple chat
  sessions.

The final ownership move ships with `AI-09`: the registry-owning
`LinkProcessorDO` becomes the one library-level accounting boundary, and
`/clear` is removed in favor of creating or deleting explicit conversations.
Automatic context compaction settles against the same allowance as its answer
turn.

## Verification

- A settled period at the limit rejects later turns; repeated settlements do
  not double-count.
- Approved tool continuations are metered exactly like ordinary turns.
- Rejected destructive tools consume no tool-side work.
- Read and non-destructive write tools remain available until the shared token
  allowance is exhausted.

## Delivered

Completed in PR #121. `LinkProcessorDO` owns one atomic, idempotently settled
ledger per library and usage window. Every normal turn, continuation, approved
or rejected destructive-tool continuation, and private compaction uses the same
allowance path, while customer-facing credits remain independent from private
provider-cost configuration.
