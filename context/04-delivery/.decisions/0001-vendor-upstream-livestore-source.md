# Vendor pinned upstream LiveStore source for every build mode

Status: accepted

## Context

Cloudstash needed LiveStore Durable Object hibernation and recovery fixes before
a suitable published package was available. Local-only source linking or a
production-only snapshot would make tests and deployed behavior differ. The
upstream monorepo's workspace dependencies and source/WASM layout make ordinary
git package dependencies unsuitable.

## Evidence and Argument

- [PR #79](https://github.com/bohdanbirdie/cloudstash/pull/79) replaced local
  package patches with a SHA-locked submodule and reports production hibernation
  validation.
- [PR #82](https://github.com/bohdanbirdie/cloudstash/pull/82) retired the fork,
  repointed to upstream `main`, aligned Effect v4 and matching snapshots, and
  added bundle provenance checks.
- `tools/livestore-local.ts` derives aliases from package exports and handles
  Effect/React identity plus WASM/conditional-export exceptions.
- GitHub dependencies cannot consume individual `workspace:*` monorepo packages
  with their build context intact; republishing would rename/own another package
  distribution.

## Options

| Option                                                         | Tradeoffs                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Wait for stable npm releases                                   | Simplest consumption, but blocks urgent upstream fixes and contribution validation.                                       |
| Maintain generated Bun patches over published distributions    | Ships through normal packages, but large source/dist diffs are brittle and obscure provenance.                            |
| Republish packages under a private/new scope                   | Reproducible, but creates a release pipeline and package identity Cloudstash should not own.                              |
| Pin upstream as a submodule and alias source in all Vite modes | Adds pnpm/submodule setup and build complexity, but makes local tests and production consume the same auditable revision. |

## Decision

Commit `vendor/livestore` as a pinned upstream submodule and use its TypeScript
source by default in development, tests, and production. Retain matching
published snapshots for types/WASM/conditional exceptions and explicit A/B mode.
Fail builds when default source is absent and certify the embedded revision after
build.
