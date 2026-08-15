# DELTA-040: Link failure UX hides actionable recovery

Status: open

## Divergence

Failed/unfetchable links remain visible, but ordinary users see a generic “No
summary for this one” state and cannot invoke the existing reprocess action,
which is hidden behind admin role checks. The UI does not expose the persisted
failure category or an actionable retry path.

## Intent

[CS.PROD-R08](../01-product/requirements.md) requires a meaningful processing/
failure state and reprocessing capability for failed links.

## Implementation

[`ai-summary.tsx`](../../src/components/right-pane/detail-view/ai-summary.tsx)
renders the generic empty message. [`reprocess-button.tsx`](../../src/components/right-pane/headers/per-link/reprocess-button.tsx)
hides reprocessing from non-admin users, and
[`docs/kanban.md`](../../docs/kanban.md) records the outstanding failure/retry UX.

## Direction

update implementation

## Resolution Signal

Delete this delta when failed links display a safe actionable failure category,
entitled/authorized ordinary users can request reprocessing with bounded
feedback, and component/flow tests cover failed, retrying, and recovered states.
