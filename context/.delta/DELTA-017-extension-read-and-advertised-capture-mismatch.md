# DELTA-017: Published extension listing needs behavior reconciliation

Status: open

## Divergence

Repository privacy, landing, and README copy now match the popup: opening it
reads the active tab URL, title, and favicon so the user can choose to save it,
and the popup requires a Save action. The published Chrome Web Store listing is
external state and still needs a maintainer verification/update against that
workflow.

## Intent

[CS.SYS.INT-R07 and CS.SYS.INT-R11](../02-system/07-integrations/requirements.md)
require least-privilege reads and truthful shipped workflows.

## Implementation

[`popup/data.ts`](../../apps/extension/entrypoints/popup/data.ts) runs the query
on mount, [`services/tabs.ts`](../../apps/extension/lib/services/tabs.ts)
returns URL/title/favicon, and [`wxt.config.ts`](../../apps/extension/wxt.config.ts)
has no command. Repository surfaces now describe that behavior. The store
listing can only be confirmed or changed through the publisher dashboard.

## Direction

update implementation

## Resolution Signal

Delete this delta when the published Chrome Web Store listing is verified to
describe opening the popup and choosing Save without claiming an unavailable
global shortcut or automatic toolbar capture.
