# DELTA-020: Release path can deploy uncertified artifacts

Status: open

## Divergence

`build:prod` mutates remote D1 before proving the build and `deploy` does not
build or certify. Depending on ignored local state, Wrangler may deploy stale
generated output or raw root source. CI now runs the ordinary production build,
but certification still lacks deployment-plan size and authenticated pricing
checks.

## Intent

[CS.DEL-R07, CS.DEL-R08, and CS.DEL-R13](../04-delivery/requirements.md) require
artifact-first certification and CI coverage before remote mutation.

## Implementation

[`package.json`](../../package.json) defines `build:prod` as remote migration
before Vite build and `deploy` as remote migration followed by `wrangler deploy`.
[CI](../../.github/workflows/ci.yml) now runs `bun run build`, but
[`verify-bundle.ts`](../../scripts/verify-bundle.ts) has no compressed-size/
deployment-plan assertion and `check:pricing` remains outside CI. Generated
deploy redirects/output are ignored local artifacts.

## Direction

update implementation

## Resolution Signal

Delete this delta when release creates the exact immutable deploy input before
any migration, deploy fails closed when it is absent/stale, compressed size is
checked against a declared production plan, and authenticated pricing is
reconciled at the appropriate release/config boundary.
