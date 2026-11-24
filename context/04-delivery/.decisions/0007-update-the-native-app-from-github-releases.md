# Release and update the native app from GitHub Releases

Status: accepted

## Context

The Mac app (`apps/native`) needed an installable, signed build and a way to
update itself in the background, with the user choosing when to restart. The
app already had its own update UI: a sidebar row (ready, installing, failed)
and a full-window must-update screen. The maintainer chose to build releases on
GitHub Actions rather than on his Mac, and to release only when the version
changes.

## Evidence and Argument

The repository is public, so release assets download without credentials, and
`releases/latest/download/latest.json` always names the newest release. The
maintainer has a Developer ID Application certificate (team `E6JHWE4P5L`), so
an update can be checked against that team with `codesign -R` as well as
against a separate update key, and a stolen feed alone can't ship code.
`cargo-packager-updater`, the closest Rust updater, was last released in July
2025 and drives its own flow; Sparkle is the macOS standard but needs an
embedded framework and an Objective-C user driver to keep our UI. A local test
(0.1.0 finding a signed 0.1.1 on a local feed) downloaded, verified, swapped
and relaunched into 0.1.1.

## Options

| Option                                 | Tradeoffs                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Sparkle                                | Proven and handles many edge cases, but adds a framework and an Objective-C bridge to keep our UI      |
| cargo-packager and its updater         | Ready-made Rust flow, but unmaintained for over a year and shaped around its own packaging             |
| Own small updater over GitHub Releases | About 300 lines we own, fits our UI states; we keep the edge cases (translocation, rollback) ourselves |

## Decision

Use our own updater (`apps/native/src/update.rs`) over GitHub Releases, with an
Ed25519-signed zip and a Developer ID team check, and swap the bundle in place
on restart. Build and publish with `native-release.yml` when `main` gets an
unreleased version. Revisit if updates need delta downloads, admin-owned
installs, or a staged rollout, which Sparkle or a server-side feed would give.
