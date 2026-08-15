# DELTA-005: Landing promises a complete export that current export cannot produce

Status: open

## Divergence

The landing says users can export “the whole archive—links, summaries, tags—in
one click,” while the current client export emits the currently selected/view
link rows as plain URLs or Markdown and does not include tags or guarantee
whole-Vault scope.

## Intent

[CS.PROD-R09](../01-product/requirements.md) and
[CS.SYS.RET-R04](../02-system/06-retrieval-and-agent/requirements.md) require a
truthful portable export surface.

## Implementation

[`export-markdown.ts`](../../src/lib/export-markdown.ts) outputs URL and
Markdown formats with link fields, description, and summary but no tags. The
broader claim also appears in landing FAQ/SEO and Free-plan surfaces, including
a visual `archive.json` representation that is not a current export format.

## Direction

update implementation

## Resolution Signal

Delete this delta when all deployed copy is narrowed to the actual selected-row
URL/Markdown export, or after a separately approved whole-Vault export adds the
promised links, summaries, and tags with documented scope. Machine-restorable
event history is not required by the current product promise.
