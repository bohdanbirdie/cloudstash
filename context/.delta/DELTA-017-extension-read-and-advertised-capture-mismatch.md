# DELTA-017: Chrome extension is unavailable from the Web Store

Status: open

## Divergence

Repository privacy, landing, and README copy match the popup: opening it reads
the active tab URL, title, and favicon so the user can choose to save it, and
the popup requires a Save action. Google has removed the previously published
Chrome Web Store listing for an as-yet unknown reason, so new users cannot
install through the advertised store path.

## Intent

[CS.SYS.INT-R07 and CS.SYS.INT-R11](../02-system/07-integrations/requirements.md)
require least-privilege reads and truthful shipped workflows.

## Implementation

[`popup/data.ts`](../../apps/extension/entrypoints/popup/data.ts) runs the query
on mount, [`services/tabs.ts`](../../apps/extension/lib/services/tabs.ts)
returns URL/title/favicon, and [`wxt.config.ts`](../../apps/extension/wxt.config.ts)
has no command. Repository surfaces describe that behavior, but restoring the
external listing requires publisher-dashboard access and may require a
repository change once Google's removal reason is known.

## Direction

update implementation

## Resolution Signal

Delete this delta when the extension is publicly installable from the Chrome
Web Store again and the restored listing describes opening the popup and
choosing Save without claiming an unavailable global shortcut or automatic
toolbar capture.
