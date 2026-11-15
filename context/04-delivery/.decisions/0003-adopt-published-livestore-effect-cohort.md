# Adopt a fully published LiveStore snapshot with its Effect cohort

Status: accepted

## Context

The requested dependency upgrade crosses Effect's beta-to-stable API changes
and LiveStore's state-fingerprint and internal binary RPC changes. Upstream
PR 1727 is merged but its snapshot publication is incomplete. The maintainer
chose the last available snapshot instead of repairing upstream publishing.

## Evidence and Argument

- [The dependency manifest](../../../package.json) and matching submodule pin
  select snapshot `e2a52cf14883bb032fd52a62b698a1dad04457ec` with Effect `4.0.3`,
  matching the published LiveStore peer-dependency cohort.
- [Upstream release notes](../../../vendor/livestore/CHANGELOG.md) document
  the intentional one-time state rebuild after adopting canonical fingerprints.
  Event-log history remains the replay source; server-side replay incurs
  Durable Object row-write usage.
- [Event wire-format tests](../../../src/livestore/__tests__/event-wire-format.test.ts)
  protect existing encoded event payloads, while Worker E2E tests cover server
  sync, live pull, and canonical library RPC.
- [Bundle certification](../../../scripts/verify-bundle.ts) now checks the
  SchemaBinary RPC path instead of requiring the removed msgpackr dependency.

## Options

| Option                                                             | Tradeoffs                                                                                                                  |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Retain the beta snapshot                                           | Avoids the immediate state rebuild, but defers the requested upgrade and stable Effect APIs.                               |
| Adopt the last fully published snapshot and matching Effect cohort | Keeps source and published packages aligned, but requires compatibility changes and a one-time materialized-state rebuild. |
| Mix the latest upstream source with older published packages       | Avoids waiting for publication, but violates source/package provenance and can mix incompatible codecs and types.          |

## Decision

Pin all LiveStore packages and vendored source to the fully published snapshot,
and pin the shared Effect cohort to `4.0.3` in the application and extension.
Preserve application event contracts and MCP validation behavior while adapting
to stable APIs. Call out the one-time rebuild and row-write cost for deployment
review; this dependency change does not authorize a production deployment.
