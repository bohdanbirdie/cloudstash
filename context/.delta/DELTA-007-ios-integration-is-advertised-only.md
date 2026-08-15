# DELTA-007: iOS integration is advertised without a maintained realization

Status: open

## Divergence

The landing and Plus plan present an iOS Share Sheet/Shortcut as a current
capture source, but this repository contains no iOS client, Shortcut artifact,
published installation path, or server connect flow specific to iOS.

## Intent

[CS.SYS.INT-R11](../02-system/07-integrations/requirements.md) and
[CS.PROD-R10](../01-product/requirements.md) require integration claims to match
a usable realization.

## Implementation

[`integrations-tiles.tsx`](../../src/components/landing/integrations-tiles.tsx)
renders “iOS Share Sheet,” [`plan.ts`](../../src/lib/plan.ts) includes iOS in
Plus copy, and [`docs/kanban.md`](../../docs/kanban.md) still lists “iOS Shortcut
as injection source” as incomplete.

## Direction

update implementation

## Resolution Signal

Delete this delta when deployed plan, landing, FAQ, SEO, privacy, and footer
surfaces no longer present iOS as available. A future versioned, installable iOS
realization remains roadmap work and may restore the claim after verification.
