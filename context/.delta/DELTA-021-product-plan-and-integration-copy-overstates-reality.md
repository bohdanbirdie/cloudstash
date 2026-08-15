# DELTA-021: Product and plan copy overstates several shipped capabilities

Status: open

## Divergence

Current copy presents a generally larger Pro summary model, a weekly digest of
what users read, front-browser-tab Raycast capture, and shipped multi-workspace
collaboration. Runtime behavior instead limits the alternate model to eligible X
enrichment, selects digest links by save time, exposes Raycast URL/clipboard
commands, and has unresolved shared-workspace product semantics.

## Intent

[CS.PROD-R10 and CS.PROD-R12](../01-product/requirements.md) require truthful
availability/value independent of executable entitlement defaults.

## Implementation

[`plan.ts`](../../src/lib/plan.ts) contains larger-model/read-digest bullets;
weekly digest selects `createdAt`; landing Raycast copy says front tab; README
claims multi-workspace support while [CS-DQ1](../open-questions.md) remains open
and the normal app has no workspace-switch/collaboration experience.

## Direction

update implementation

## Resolution Signal

Delete this delta when plan, landing, README, SEO, and integration copy describe
only the implemented X-specific model, saved-link digest, Raycast workflows, and
personal-workspace product—or separately approved implementations and contracts
make each broader claim true.
