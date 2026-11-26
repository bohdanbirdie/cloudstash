# Seed empty local libraries from the dev server

Status: accepted

## Context

A new worktree starts with an empty library, and an empty library is hard to
test against. `scripts/dev-seed.ts seed` could fill one from the maintainer's
links file, but it was a manual step that signed in as a test account. The
maintainer signs in with Google, which lands in his own new workspace on that
server, so a test-account seed left him looking at an empty library more than
once.

## Evidence and Argument

Better Auth creates the workspace (an organization) in
`session.create.before` for any sign-in, Google or email. The library itself
is a LiveStore store keyed by that organization and only comes into being on
its first `/sync` connection. That connection is the one moment every account
passes through, and it carries the session cookie the seed needs to act as
that account. The dev server (`vite serve` under `alchemy dev`) runs in Bun and
can read `local/`; the Worker runs in workerd and cannot, and anything put in
the Worker would ship to staging and production. Seeded links carry
`LinkProcessingCancelled` and `LinkSourceNotified` before `LinkCreated`, so the
link processor's pending query never selects them.

## Options

| Option                                               | Tradeoffs                                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Keep a manual `seed` step                            | No new code, but has to be remembered per account and kept failing for Google sign-ins                      |
| Seed in a Worker auth hook at workspace creation     | Sees every new workspace, but the Worker cannot read `local/` and the code would deploy to every stage      |
| Seed the test account when the dev server starts     | Simple, but misses the account the maintainer actually uses                                                 |
| Dev server plugin seeds on a library's first `/sync` | Any account, no extra step; code only exists in `vite serve`; needs the browser's session to reach the seed |

## Decision

A Vite plugin (`tools/dev-seed/vite-plugin.ts`, `apply` only for `serve`, off
under Vitest and Storybook) watches `/sync` upgrades and, once per library per
server run, runs `dev-seed.ts seed --if-empty` with that connection's cookie.
`--if-empty` leaves a library that ever had a link alone. `DEV_SEED=off` turns
it off, and a missing links file is one warning line. Connections without a
cookie (the native app's API key) are not seeded; opening the web app once
seeds that library. Revisit if libraries stop being created on first sync or
the dev server stops being Vite.
