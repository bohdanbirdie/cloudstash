# Share the Mac app's compiled dependencies between worktrees

Status: accepted

## Context

The maintainer works in many git worktrees at once on a Mac with little free
disk. A debug build of the Mac app fills `apps/native/target` with about
1.5 GB after one build and about 3 GB after a day, almost all of it compiled
third-party crates (rune, wgpu, the LiveStore client) that are the same in
every worktree. `node_modules` looks like 2.3 GB but costs about 50 MB of real
disk per worktree, because Bun installs by `clonefile` from its own cache on
macOS. Each worktree must keep its own Cloudstash Dev
([decision 0011](./0011-run-worktrees-side-by-side.md)), and the fix has to
come from the repository's normal commands, not a per-machine step.

## Evidence and Argument

Measured on Cargo 1.99.1, macOS, APFS (2026-11-27):

- A cold `cargo build` takes about 105 s; a rebuild after a one-line change
  about 2 s. The app's own crate is about 100 MB of `deps` plus about 100 MB
  of incremental data; the rest is dependencies.
- A shared `build.build-dir` (`{cargo-cache-home}/build/cloudstash-native`)
  shares everything but is wrong: the app's crate gets the same unit hash in
  every worktree, and Cargo judges it fresh by file times, so a worktree whose
  sources are older than another worktree's last build takes that build as up
  to date. Built with a change in worktree A, worktree B's `cargo build` said
  `Finished` in 0.2 s and its binary carried A's change. Content checksums
  (`-Z checksum-freshness`) would fix this but are unstable in 1.100 and 1.101
  beta, and the shared directory has one lock and no garbage collection
  (`-Z gc`, `-Z fine-grain-locking` are unstable too).
- A worktree whose `target/debug` starts as a `cp -cRp` clone of another
  build, with the app's crate removed, rebuilt only the app's crate: 14 s for
  `scripts/run.sh` instead of 110 s, and about 200 MB of new disk instead of
  about 1.5 GB. Two worktrees built at the same moment without waiting on each
  other, a change in one did not rebuild or reach the other, and both apps ran
  side by side.
- `cp -c` silently falls back to a full copy where cloning is not possible.

## Options

| Option                                    | Tradeoffs                                                                    |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| One shared `CARGO_TARGET_DIR`             | Most sharing, but one app binary and one lock for every worktree             |
| Shared `build.build-dir`                  | Cargo-native, but serves one worktree's app build to another on stable Cargo |
| sccache                                   | Saves compile time, not disk                                                 |
| Clone dependencies into each new `target` | Shares blocks until they change; only new worktrees benefit; needs APFS      |

## Decision

`apps/native/scripts/run.sh` keeps one cache, `~/Library/Caches/cloudstash/native-debug`.
When a worktree has no `target/debug`, it clones the cache there before
`cargo build`. After launching the app it replaces the cache with clones of
the dependency units that build used, as its JSON messages name them, one
worktree at a time under a lock directory. Units of older builds, tests and
clippy that `target/debug` also keeps stay out, as does the app's crate, so the
cache holds one build's worth and old dependency versions leave with it.
It does nothing unless `target` and the cache are on one APFS volume. Cargo
configuration, CI and release builds are unchanged. Revisit when Cargo
stabilizes checksum freshness, so a shared `build.build-dir` becomes safe.
