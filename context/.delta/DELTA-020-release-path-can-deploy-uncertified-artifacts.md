# DELTA-020: Release path can deploy uncertified artifacts

Status: open

## Divergence

The production deploy now runs through Alchemy. Alchemy applies D1 migrations
before it builds the Worker, so the deploy workflow first runs the build, the
bundle certification (`verify-bundle.ts`), and the bundle smoke test, and
deploys only if they pass; a failed build no longer mutates remote D1. The
deploy does not wait for the rest of CI on the same commit, and authenticated
pricing checks remain outside the release boundary.

## Intent

[CS.DEL-R07, CS.DEL-R08, and CS.DEL-R13](../04-delivery/requirements.md) require
artifact-first certification and CI coverage before remote mutation.

## Implementation

[`alchemy.run.ts`](../../alchemy.run.ts) declares the Vite build and D1
migrations, and the [deploy workflow](../../.github/workflows/deploy.yml) runs
`bun run build` and `alchemy deploy --stage prod` on pushes to `main`. It does
not rerun [PR checks](../../.github/workflows/pr-checks.yml), and the bundle
smoke test runs only in PR checks and locally. [`check:pricing`](../../package.json) remains outside CI and
release.

## Direction

update implementation

## Resolution Signal

Delete this delta when release creates the exact immutable deploy input before
any migration, deploy fails closed when it is absent/stale, and authenticated
pricing is reconciled at the appropriate release/config boundary.
