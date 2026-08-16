# Complete reliable account deletion

## Problem and outcome

The deletion Workflow exists, but current evidence does not support describing
it as contract-complete or as removing every byte. Close the documented
ordering, intake-fencing, target-inventory, and retention gaps.

## Agreed scope and non-goals

- Reject inconsistent owner/workspace state before Better Auth removes identity.
- Fence external intake outside storage that the purge itself deletes; disable
  authoritative sources before wiping LiveStore clients/backends.
- Reconcile the owned storage/provider inventory in account-lifecycle Intent,
  explicitly classifying selectively purgeable and retained surfaces.
- Propagate target failures and retain durable retry/triage evidence.
- No promise of “every byte” or immediate erasure where platform retention is
  bounded but not selectively controllable.

## Agreed constraints

- Product/legal copy must distinguish access revocation, active purge, and
  bounded provider/platform retention.
- Exact retention wording remains a legal/maintainer decision; do not invent it.

## Acceptance criteria

- Inconsistent tenancy blocks identity deletion and surfaces an actionable error.
- Late or replayed intake cannot reconstruct purged Vault state.
- Every owned target either proves successful purge or leaves an errored,
  retryable Workflow step; no target failure is swallowed.
- A maintained inventory names non-selectively erasable surfaces and their
  approved retention wording.
- Adversarial E2E covers mid-workflow failure, retry, late intake, and final
  inability to authenticate/read the workspace.
- Privacy, settings, and deletion UI avoid unsupported complete-removal or
  every-byte claims.

## Dependencies and risks

Tracks DELTA-003, DELTA-009, DELTA-013, DELTA-019, and DELTA-035. Legal sign-off
on retention language is a separate human action. Cloudflare Workflow/Queue and
analytics retention may constrain the strongest possible claim.

## Size and uncertainty

Large. Core orchestration exists; deletion ordering, intake fencing, and
non-selective provider retention are high-risk.
