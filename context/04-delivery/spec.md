# Delivery — Spec

This document specifies repository composition, build provenance, and release
flow. It builds on [requirements.md](./requirements.md).

## Status

Active.

## Repository Composition

```text
cloudstash/                         Bun + Vite+ application
  apps/extension/                  WXT Chrome extension (Bun workspace)
  apps/native/                     experimental Rune macOS app (standalone Cargo workspace)
  vendor/livestore/                read-only upstream reference submodule
  local/raycast-extension/         ignored external npm checkout
```

The root uses Bun 1.4.x, Vite+, TypeScript, Vitest, and Alchemy. Dependency
versions are exact where compatibility is sensitive.
The root and extension typechecks use the Effect-patched TSRS build shipped by
`@effect/tsgo`, with both wrapper and compiler version pinned. TypeScript and
Effect diagnostics share one root compiler pass in the quality job; the unit
job does not repeat it. The JavaScript `@effect/language-service` package and
its TypeScript patch remain for editors using TypeScript 6, not for CI checks.
See [decision 0005](./.decisions/0005-use-effect-patched-tsrs.md).
Vite+ checks, fixes, and staged checks also run through the wrapper with
`--tsrs-lint=7.1.0-beta.tsrs3`, replacing Oxlint's Go type-aware backend with
Effect-patched TSRS while retaining the existing lint rules and JS plugins.
The Raycast extension is a separate published repository and shares only HTTP
contracts.

`apps/native/` is an experimental native client. It is its own Cargo workspace
with its own lockfile and gitignored `target/`, pinned to a prerelease Rune
revision; nothing in the Bun workspace builds or imports it, and CI builds it
only to run its LiveStore contract tests. It shares only HTTP contracts with
the worker: the native pairing
flow in [auth-and-tenancy](../02-system/02-auth-and-tenancy/spec.md#pairing-flows)
and API-key LiveStore sync. Card pictures are kept as small local copies in each
library's folder and deleted with it on sign-out, or at the next launch that
finds no session; at most 80 MB of them are kept decoded in memory, per
[decision 0006](./.decisions/0006-bound-native-picture-memory.md). Saved links open in the browser only when they are web
addresses. The window's page is one `Place` value (a library state or a space
by id), changed only through `nav::go`, so every navigation (sidebar, palette,
⌘1 to ⌘4 for the states in sidebar order, later menus and links) takes the
same path. Between launches AppKit keeps the window's position and size, and
`ui.json` in the app's folder keeps the page, grid or feed, the kind filter and
the sidebar's state and width. Each value is checked as it loads and an
unknown one falls back to its default, so no saved state can strand the app;
the file is replaced atomically, and sign-out forgets the page and filter.
Settings is a window of its own (⌘, or Cloudstash ▸ Settings…) with General
(the account, Sign Out behind a confirmation, the theme, Open at login, and
the Dock and menu bar icons), Updates (shown only, until the updater lands)
and About. Open at login registers the app as a macOS login item; macOS keeps
it, so Settings reads it back each time it opens. The theme sets the application's appearance, so both
windows follow it. The app can hide its Dock icon only while its menu bar icon
(the logo; a click brings the window forward) shows, so it can always be
found; `ui.json` keeps the theme and both icons across sign-out and restores a
Dock icon if neither was saved on.

Local provider configuration is represented by committed 1Password references
in `.env.example`. `bun run env:sync` explicitly and atomically materializes
the ignored `.env` with mode `0600`; failed resolution preserves the
previous local file and no plaintext backup is retained. Normal development
starts do not contact 1Password.

## LiveStore Version

Every `@livestore/*` dependency in the application and extension pins the same
published upstream snapshot, `0.0.0-snapshot-<upstream-commit-sha>`. Upstream
publishes one snapshot for each commit on `main`. Dev, tests, and production
builds all resolve LiveStore from these installed packages; there is no Vite
alias. `vendor/livestore` is a submodule at the same upstream commit, kept only
as a source reference: nothing imports it, nothing installs its dependencies,
and builds and CI do not check it out. The rationale is recorded in
[decision 0004](./.decisions/0004-consume-published-livestore-snapshots.md),
which supersedes [decision 0001](./.decisions/0001-vendor-upstream-livestore-source.md).

The current pin is snapshot `4bedac6261d75bf3bde1ada2bdf5bdc21e850bea`,
paired with the Effect `4.1.4` cohort in both the web app and extension.
Snapshot upgrades select a fully published package cohort, not a partially
published upstream revision or a newer Effect version outside that cohort.
The general seven-day release-age gate remains enabled. The exact-pinned
Effect cohort and matching LiveStore package closure are excluded in
`bunfig.toml` so an intentional snapshot upgrade can install freshly published
packages; unrelated dependencies remain subject to the age gate.
This upgrade crosses LiveStore's switch from Effect AST hashes to canonical
state fingerprints. The first open rebuilds materialized state once from the
retained event log, including server-side clients in Durable Objects; deployment
must account for the associated row-write usage. It is not a D1 migration or an
event-log reset. See the
[upstream release notes](https://github.com/livestorejs/livestore/blob/4bedac6261d75bf3bde1ada2bdf5bdc21e850bea/CHANGELOG.md) and
[upgrade decision](./.decisions/0003-adopt-published-livestore-effect-cohort.md).

## Build

`bun run build` runs the same Vite build that Alchemy runs during a deploy,
with Alchemy's Cloudflare Vite plugin, then verifies the bundle. A Vite plugin
prerenders public pages at the end of every build. The Worker (`ssr`)
environment is Oxc-minified while client build defaults remain independent.
Bundle certification checks no known Effect v3 version
string, the SchemaBinary RPC runtime and absence of the legacy msgpack runtime
and native extraction binding, one distinct React
version string, and raw/compressed Worker upload budgets. CI boots the
generated minified Worker for a D1/auth/SyncBackendDO handshake. These are
targeted regression indicators, not proof that no same-version duplicate
runtime exists.

Cloudflare Assets serves static output with Worker-first exceptions declared
once in `worker.config.ts`, which `alchemy.run.ts`, the standalone Vite build,
and the local test runtimes (`tools/local-worker.ts`) share.

## CI and Contract Certification

`bun run check:intent` scans only Cloudstash's `context/` tree and enforces
required node pairs, structure, links, IDs/refinements, statuses, companion
record shape, and evidence-link hygiene. Semantic quality remains review work.

The PR checks workflow uses a frozen Bun install. Quality, unit, Worker E2E,
and extension/production-build certification run as parallel jobs on Bun
(`bun --bun run`, no Node setup), for pull requests targeting `staging` or
`main`; see [decision 0006](./.decisions/0006-run-ci-and-repo-scripts-on-bun.md). Every workflow job has a
timeout, so a hung step fails the run instead of holding it open. Merges are not re-certified;
the deploy workflows start on each push to `staging` and `main`.
The workflow has no Markdown path ignore, so Intent-only changes trigger CI.
Pricing reconciliation remains outside the CI release evidence; see
[DELTA-020](../.delta/DELTA-020-release-path-can-deploy-uncertified-artifacts.md).

## Migrations and Deploy

All infrastructure is declared in `alchemy.run.ts`; see
[decision 0005](./.decisions/0005-manage-infrastructure-with-alchemy.md). D1
migrations are generated by Drizzle and reviewed, and Alchemy applies pending
ones as part of a deploy. Alchemy reconciles D1, and so applies migrations,
before it builds and uploads the Worker, so the deploy workflow builds the
Worker and runs `verify-bundle` first and deploys only if it passes. The
minified-bundle smoke test (`bun run test:bundle`) runs in PR checks and
locally, not in the deploy workflow. Drizzle v1 writes one
folder per migration in `drizzle/migrations/`, the layout Alchemy reads. Alchemy records applied migrations in
`__alchemy_migrations`; on first contact it copies Wrangler's `d1_migrations`
history by file name and leaves that table untouched. Durable Object
classes are declared as Worker bindings and deploy through Cloudflare's
`exports` map. A change to existing DO-owned LiveStore persistence requires the
upstream persistence format/version strategy, not only local state cleanup.

Production is the `prod` stage. `bun run deploy` deploys it with the shared
Cloudflare state store; the GitHub Actions deploy workflow runs it on pushes to
`main` with secrets from the `production` environment. Production resources
are protected: a plan that would delete or replace one fails before applying.
Staging is the `staging` stage, on `staging.cloudstash.dev` with its own
resources. Feature pull requests target the `staging` branch, and each merge
into it deploys the stage with secrets from the `staging` environment; the
maintainer can also deploy any branch to it by hand. A `staging` → `main` pull
request, merged with a merge commit, releases to production. Its resources are not protected. Preview stages are
not defined.

Remote migration/deploy/secret operations are maintainer-controlled. Agent and
ordinary local commands stop at local migrations, checks, builds, and explicit
review artifacts unless the maintainer separately authorizes a remote action.

## Native App Delivery

The Mac app's version is `apps/native/Cargo.toml`'s; debug builds don't
update. When `main` gets a version with no `native-v<version>` tag,
`native-release.yml` builds a universal app (`apps/native/scripts/release.sh`),
signs it with the maintainer's Developer ID and hardened runtime, notarizes and
staples it and its disk image, and publishes them as the repository's latest
GitHub Release with an update zip and `latest.json` (version, zip address,
Ed25519 signature). The signing certificate, notary key and update key are
secrets of the `native-release` environment, which only `main` may use; the
update key's public half is in `src/update.rs`.

Installed apps read the latest release's `latest.json` at launch and every
four hours and download a newer version in the background. An update is
offered only after its zip's signature verifies, its bundle id and version
match, and `codesign` confirms the maintainer team's Developer ID; restarting
swaps it in place with two renames, rolled back on failure. A copy that can't
be replaced in place (translocated, read-only) doesn't check. Per
[decision 0007](./.decisions/0007-update-the-native-app-from-github-releases.md).

## Extension Delivery

The Chrome extension builds and zips from `apps/extension`; a manual GitHub
workflow submits to Chrome Web Store using repository secrets. Manifest IDs and
allowed production/dev origins remain aligned with Worker configuration. The web
Worker and store extension can deploy independently, so protocol changes remain
backward-compatible across store review lag.
