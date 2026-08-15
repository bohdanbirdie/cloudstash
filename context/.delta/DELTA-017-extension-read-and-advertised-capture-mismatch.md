# DELTA-017: Extension reads more and captures differently than claimed

Status: open

## Divergence

The extension privacy contract says it reads only the active-tab URL and only
when Save is clicked. The popup queries on mount and reads URL, title, and
favicon. Landing/store copy also advertises a global shortcut or immediate
one-click toolbar save, but the manifest has no command and the popup requires a
separate Save action.

## Intent

[CS.SYS.INT-R07 and CS.SYS.INT-R11](../02-system/07-integrations/requirements.md)
require least-privilege reads and truthful shipped workflows.

## Implementation

[`popup/data.ts`](../../apps/extension/entrypoints/popup/data.ts) runs the query
on mount, and [`services/tabs.ts`](../../apps/extension/lib/services/tabs.ts)
returns URL/title/favicon. [`wxt.config.ts`](../../apps/extension/wxt.config.ts)
has no command, while landing/integration/store-listing copy describes shortcut
or immediate toolbar capture.

## Direction

update implementation

## Resolution Signal

Delete this delta when implementation and privacy/store/landing copy agree on
exact read timing/fields and interaction count, with manifest and popup tests
covering any claimed shortcut or toolbar action.
