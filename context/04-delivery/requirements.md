# Delivery — Requirements

## Context

Owns repository composition, dependency/runtime policy, LiveStore source
provenance, builds, migrations, CI, and release paths.

## Assumptions

- **CS.DEL-A01 One deployable web Worker:** The web app, API, queue consumer, and
  stateful classes currently ship from one Cloudflare Worker build.
  - Validation: [`alchemy.run.ts`](../../alchemy.run.ts) and Vite output.
- **CS.DEL-A02 LiveStore may need unreleased fixes:** Cloudstash may need an
  upstream LiveStore revision before a stable npm release exists. Upstream
  publishes a snapshot package for each commit on `main`, so such a revision is
  consumable once it lands upstream.
  - Validation: hibernation/recovery contribution history.

## Constraints

- **CS.DEL-C01 Toolchain split:** Cloudstash root uses Bun/Vite+; the external
  Raycast repository uses npm.
- **CS.DEL-C02 Cloudflare migrations:** D1 and Durable Object class migrations
  must be applied in a deploy-compatible order.

## Acceptable Tradeoffs

- **CS.DEL-T01 Upstream-first fixes:** A LiveStore fix must land upstream and be
  published as a snapshot before Cloudstash consumes it, in exchange for no
  vendored source, second package manager, or alias tooling.
- **CS.DEL-T03 Exact moving-edge pins:** Effect beta and LiveStore snapshot
  versions are exact and updated atomically rather than floated.

## Requirements

- **CS.DEL-R01 Unified root toolchain:** Development/build/check/package commands
  use Bun and Vite+ as declared in `package.json` and `vite.config.ts`.
- **CS.DEL-R02 Reproducible install:** The root lockfile is honored in CI; dependency resolution observes the configured minimum release age.
- **CS.DEL-R03 Pinned upstream snapshot:** Every `@livestore/*` dependency in the
  application and extension pins the same exact published upstream snapshot
  version.
- **CS.DEL-R04 Snapshot/Effect parity:** The pinned Effect version must match
  the peer-dependency cohort of the pinned LiveStore snapshot. `refines: CS.SYS.SYNC-R10`
- **CS.DEL-R07 Bundle certification:** Build output must verify critical
  runtime identity/CSP assertions and compressed
  size against the declared deployment plan.
- **CS.DEL-R08 Complete CI:** CI runs Intent, quality, type, unit, E2E, extension, and
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
