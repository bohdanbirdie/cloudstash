# Consume published LiveStore snapshots instead of vendored source

Status: accepted

## Context

[Decision 0001](./0001-vendor-upstream-livestore-source.md) vendored upstream
LiveStore as a git submodule because Cloudstash needed unreleased fixes from a
fork. The fork has since been merged upstream, and upstream now publishes a
snapshot package for every commit on `main`. The vendored copy then only
duplicated the published snapshot while adding a pnpm workspace, alias
tooling, a large local checkout, and install steps that silently went stale
after a submodule bump added a dependency.

## Evidence and Argument

- [The dependency manifest](../../../package.json) already pinned every
  `@livestore/*` package to the snapshot of the same commit as the submodule.
- Upstream publishes `0.0.0-snapshot-<sha>` packages per `main` commit, so any
  landed upstream fix is consumable without vendoring.
- The vendored install skipped a new dependency (`@noble/hashes`) after a
  submodule bump, breaking local dev until a manual reinstall.
- [Bundle certification](../../../scripts/verify-bundle.ts) still checks Effect,
  React, RPC runtime identity, and upload size on the published build.

## Options

| Option                                         | Tradeoffs                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Keep the vendored submodule and source alias   | Allows unreleased local LiveStore edits, but keeps pnpm, alias tooling, a large checkout, and stale-install risk. |
| Consume the published per-commit snapshot only | One package manager and a standard install; LiveStore fixes must land upstream before Cloudstash consumes them.   |

## Decision

Remove the `vendor/livestore` submodule and source alias. Dev, tests, and
production builds resolve LiveStore from the pinned published snapshot. Work on
a LiveStore fix happens in an upstream checkout outside this repository and
reaches Cloudstash through a snapshot bump.
