# Delivery — Requirements

## Context

Owns repository composition, dependency/runtime policy, LiveStore source
provenance, builds, migrations, CI, and release paths.

## Assumptions

- **CS.DEL-A01 One deployable web Worker:** The web app, API, queue consumer, and
  stateful classes currently ship from one Cloudflare Worker build.
  - Validation: [`wrangler.jsonc`](../../wrangler.jsonc) and Vite output.
- **CS.DEL-A02 LiveStore may need unreleased fixes:** Cloudstash may need an
  upstream LiveStore revision before a stable npm release exists.
  - Validation: hibernation/recovery contribution history.

## Constraints

- **CS.DEL-C01 Toolchain split:** Cloudstash root uses Bun/Vite+; vendored
  LiveStore uses pnpm; the external Raycast repository uses npm.
- **CS.DEL-C02 Cloudflare migrations:** D1 and Durable Object class migrations
  must be applied in a deploy-compatible order.
- **CS.DEL-C03 Submodule checkout:** Default development/test/production builds
  require the pinned `vendor/livestore` submodule and its dependencies.

## Acceptable Tradeoffs

- **CS.DEL-T01 Source vendoring:** Building upstream TypeScript source increases
  build surface and setup cost in exchange for local/production identity and
  immediate upstream fixes.
- **CS.DEL-T02 Published exceptions:** LiveStore WASM packages and
  platform-conditional exports remain on the matching published snapshot where
  static source aliasing is unsafe.
- **CS.DEL-T03 Exact moving-edge pins:** Effect beta and LiveStore snapshot
  versions are exact and updated atomically rather than floated.

## Requirements

- **CS.DEL-R01 Unified root toolchain:** Development/build/check/package commands
  use Bun and Vite+ as declared in `package.json` and `vite.config.ts`.
- **CS.DEL-R02 Reproducible install:** Root and vendored lockfiles are honored in
  CI; dependency resolution observes the configured minimum release age.
- **CS.DEL-R03 Pinned upstream source:** `vendor/livestore` is a committed
  upstream submodule SHA, not an untracked local clone.
- **CS.DEL-R04 Source/snapshot parity:** Published `@livestore/*` pins and
  Effect version must match the vendored revision used for runtime source and
  type resolution. `refines: CS.SYS.SYNC-R10`
- **CS.DEL-R05 Universal alias:** Dev, unit, E2E, and production Vite builds use
  the same source alias by default; published mode is an explicit A/B hatch.
- **CS.DEL-R06 Build fail closed:** A default production build must fail if the
  submodule is absent rather than silently shipping another LiveStore revision.
- **CS.DEL-R07 Bundle certification:** Build output must record and verify its
  LiveStore revision, critical runtime identity/CSP assertions, and compressed
  size against the declared deployment plan.
- **CS.DEL-R08 Submodule-aware CI:** CI checks out submodules, installs the
  vendored workspace, and runs Intent, quality, type, unit, E2E, extension, and
  production build-certification checks without swallowing failures.
- **CS.DEL-R09 Reviewed migrations:** Generated D1 SQL is reviewed for unrelated
  table rebuild/cascade effects before application.
- **CS.DEL-R10 Stateful migration safety:** LiveStore/DO persistence schema
  changes include an explicit format-version and deployed-data plan.
- **CS.DEL-R11 Extension release isolation:** Chrome extension versioning/build/
  submission runs through its own WXT workflow and store credentials.
- **CS.DEL-R12 No implicit remote mutation:** Ordinary agent/local validation
  does not deploy, apply remote migrations, or mutate production secrets.
- **CS.DEL-R13 Artifact-before-migration:** Release must build and certify the
  exact deploy artifact before any matching remote migration is applied; deploy
  must consume that current artifact rather than stale ignored output or raw
  source.
