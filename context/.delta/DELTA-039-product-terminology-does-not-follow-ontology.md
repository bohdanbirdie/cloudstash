# DELTA-039: Product terminology does not follow the ontology

Status: open

## Divergence

Current product/help copy inconsistently calls the saved-link collection both
“Vault” and “archive,” mixes reversible archiving with “trash”/delete, and uses
“organization” where no compatibility identifier requires the internal term.

## Intent

[The canonical ontology](../ontology.md) reserves Vault for the collection,
archive/restore for reversible link actions, and workspace for the tenant while
allowing organization/delete names at internal or compatibility boundaries.

## Implementation

Some landing/help surfaces still use “archive” for the collection, while
Telegram/X settings under
[`src/components/integrations`](../../src/components/integrations) already use
the intended “Vault.” [`docs/features/chat-agent.md`](../../docs/features/chat-agent.md)
uses “trash,”
and [`api-spec.ts`](../../src/components/integrations/api-spec.ts) says “Free
organizations” in copied agent-facing prose.

## Direction

update implementation

## Resolution Signal

Delete this delta when user/agent-facing landing, settings, legal, API reference,
and maintained feature prose consistently use Vault, archive/restore, and
workspace; internal schema/tool compatibility names remain documented exceptions.
