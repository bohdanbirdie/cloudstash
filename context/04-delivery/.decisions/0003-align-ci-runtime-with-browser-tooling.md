# Align the CI Node runtime with browser tooling

Status: accepted

## Context

Cloudstash's browser-oriented test environment uses jsdom. Version 30 raises
its supported Node floor to Node 22.22.2, 24.15.0, or 26 and newer, while the
repository's CI and extension publishing workflows previously selected the
short-lived Node 25 release line. Keeping Node 25 would put dependency metadata,
local package installation, and CI certification in conflict.

## Evidence and Argument

- jsdom 30 declares `^22.22.2 || ^24.15.0 || >=26.0.0` in its package engines.
- The root and extension TypeScript toolchains are upgraded together so their
  source and ambient Node types are certified against one runtime generation.
- CI already centralizes the selected Node version in explicit setup steps, so
  the change is reviewable and applies equally to quality, tests, builds, and
  extension publishing.

## Options

| Option                    | Tradeoffs                                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep Node 25 and jsdom 29 | Avoids a runtime change, but freezes browser-test tooling on an older major and leaves CI on a non-LTS odd-numbered release.                              |
| Move to Node 24 LTS       | Satisfies jsdom only from Node 24.15 onward, but requires pinning a minimum patch rather than following the repository's existing current-release policy. |
| Move to Node 26           | Satisfies the browser-tooling floor and keeps CI on the next even-numbered runtime generation, at the cost of adopting a new Node major.                  |

## Decision

Run Cloudstash CI and extension publishing on Node 26. Keep root and extension
TypeScript versions aligned, migrate Effect diagnostics to the TypeScript
7-compatible `@effect/tsgo` toolchain, and use Node 26 ambient types so
dependency, compiler, and certification environments describe the same runtime
generation.
