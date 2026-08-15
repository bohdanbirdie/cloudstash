# DELTA-032: Toolchain and onboarding commands drift

Status: open

## Divergence

Bun versions differ between package metadata and CI/release workflows, extension
publishing floats to latest, vendored installation can skip after lock/submodule
changes when `node_modules` merely exists, and README recommends `bun test`
although the intended root lane is the Vitest package script.

## Intent

[CS.DEL-R01 and CS.DEL-R02](../04-delivery/requirements.md) require one declared
root toolchain and reproducible installs/check commands.

## Implementation

[`package.json`](../../package.json), CI, and extension workflows declare
different Bun versions. [`ensure-livestore.sh`](../../scripts/ensure-livestore.sh)
uses directory existence as its install cache. [`README.md`](../../README.md)
uses a command that can invoke unintended test discovery rather than
`bun run test:unit`.

## Direction

update implementation

## Resolution Signal

Delete this delta when Bun is pinned consistently, extension release tooling is
fixed-version, vendored install invalidation keys the lockfile/submodule state,
and onboarding names the exact supported test lanes.
