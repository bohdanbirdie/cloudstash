# DELTA-023: Source notification event overstates provider delivery

Status: open

## Divergence

Telegram final-send errors are caught as best-effort success, after which the
processor commits `LinkSourceNotified`. Persisted state therefore suppresses
future retries even though no notification reached the provider.

## Intent

[CS.SYS.INT-R10](../02-system/07-integrations/requirements.md) requires
idempotent, accurately modeled source feedback that is not confused with Vault
durability.

## Implementation

[`source-notifier.live.ts`](../../src/cf-worker/link-processor/services/source-notifier.live.ts)
turns Telegram `sendMessage` failure into success.
[`do-programs.ts`](../../src/cf-worker/link-processor/do-programs.ts) then commits
`LinkSourceNotified` unconditionally.

## Direction

update implementation

## Resolution Signal

Delete this delta when the event is committed only after provider success, or is
renamed/remodeled as attempted/abandoned with explicit retry semantics, and
provider-failure tests lock the chosen behavior.
