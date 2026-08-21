# DELTA-020: Release path can deploy uncertified artifacts

Status: open

## Divergence

`build:prod` mutates remote D1 before proving the build and `deploy` does not
build or certify. Depending on ignored local state, Wrangler may deploy stale
generated output or raw root source. CI now builds, checks the declared Worker
upload budget, and smoke-tests generated output, but authenticated pricing
checks remain outside the release boundary.

## Intent

[CS.DEL-R07, CS.DEL-R08, and CS.DEL-R13](../04-delivery/requirements.md) require
artifact-first certification and CI coverage before remote mutation.

## Implementation

[`package.json`](../../package.json) defines `build:prod` as remote migration
before Vite build and `deploy` as remote migration followed by `wrangler deploy`.
[CI](../../.github/workflows/ci.yml) now runs `bun run build`, but
[`check:pricing`](../../package.json) remains outside CI and release. Generated
deploy redirects/output are ignored local artifacts.

## Direction

update implementation

## Resolution Signal

Delete this delta when release creates the exact immutable deploy input before
any migration, deploy fails closed when it is absent/stale, and authenticated
pricing is reconciled at the appropriate release/config boundary.
