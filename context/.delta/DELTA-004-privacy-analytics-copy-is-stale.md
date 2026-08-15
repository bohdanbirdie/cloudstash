# DELTA-004: Tracking disclosure and opt-out do not match behavior

Status: open

## Divergence

The privacy policy says Meta Pixel runs on every page including the signed-in
app, while current routing emits it only from selected public/login/legal routes
and OneDollarStats remains rooted across the application. The policy also says
Global Privacy Control is treated as a California opt-out, but Meta Pixel
injection has no GPC check.

## Intent

[CS-R09 and CS-R18](../requirements.md) and
[CS.PROD-R09](../01-product/requirements.md) require accurate route disclosure
and implementation of every promised tracking opt-out.

## Implementation

- [`privacy.tsx`](../../src/routes/privacy.tsx) repeats the stale every-page Meta
  claim in its collection, processor, and cookie sections.
- [`meta-pixel.tsx`](../../src/lib/meta-pixel.tsx) only defines an explicit script
  inserted by selected routes.
- [`__root.tsx`](../../src/routes/__root.tsx) inserts OneDollarStats at the root.
- [`meta-pixel.tsx`](../../src/lib/meta-pixel.tsx) injects the production Pixel
  without consulting `navigator.globalPrivacyControl` or another consent state.

## Direction

update implementation

## Resolution Signal

Delete this delta when the privacy policy accurately distinguishes Meta Pixel
and OneDollarStats scope, every promised opt-out suppresses applicable tracking,
and route/GPC tests lock the disclosed behavior.
