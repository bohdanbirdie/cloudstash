# Contain OAuth resource seed races at the package boundary

Status: accepted

## Context

Concurrent auth initialization can race Better Auth's read-then-insert resource
seed. D1 wraps the losing unique violation in `cause`, which the provider does
not recognize as its expected duplicate.

## Evidence and Argument

- D1 uniqueness, not isolate memory, is the cross-isolate arbiter.
- The provider already treats this duplicate as successful initialization.
- All unrelated initialization failures must remain visible.

## Options

| Option                             | Tradeoff                                   |
| ---------------------------------- | ------------------------------------------ |
| Cache or serialize in memory       | Cannot coordinate Worker isolates          |
| Recognize the wrapped D1 duplicate | Preserves the existing database boundary   |
| Ignore all nested duplicate errors | Risks hiding unrelated initialization bugs |

## Decision

Patch the pinned provider to follow `cause` only for D1's exact
`oauth_resource.identifier` unique violation. Rethrow every other error and
revalidate the patch on dependency upgrades.
