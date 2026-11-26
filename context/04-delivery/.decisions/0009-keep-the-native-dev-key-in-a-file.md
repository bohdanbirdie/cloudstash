# Keep the native Dev build's sign-in key in a file

Status: accepted

## Context

Cloudstash Dev kept its API key in the login keychain, like the release. A
keychain item trusts the app that wrote it by its code signature, and every
worktree builds and signs its own copy of Dev, so a build from a new worktree
could meet an item another build wrote and macOS would ask for the login
password before letting it read it. The maintainer (2026-11-26): "new worktree
must never face it again", whatever was pressed on the prompt.

## Evidence and Argument

Signing every build with the maintainer's Apple Development certificate keeps
one designated requirement, yet the prompt still appeared from a fresh
worktree. Whether it appears depends on how the item was written and on
earlier answers to the prompt, none of which a build controls. Dev only signs
in to a development server, normally the local one, and its key grants that
server's library alone.

## Options

| Option                                  | Tradeoffs                                                                                     |
| --------------------------------------- | --------------------------------------------------------------------------------------------- |
| Dev keeps its key in a 0600 file        | Never prompts, one sign-in covers every worktree; any program running as the user can read it |
| Keep the keychain, sign builds the same | Key stays in the keychain, but the prompt still depends on how the item was written           |
| Keychain item with an open access list  | No prompt, but needs Security framework code the keyring crate doesn't expose                 |

## Decision

A debug build keeps its key in `~/Library/Application Support/dev.cloudstash.native.dev/keys/<server>`,
one file per server, readable only by the user (mode 0600), written the same
way as the pending sign-in. Release builds keep the keychain.

## Consequences

Dev never touches the keychain, so no build from any worktree prompts. Every
worktree's Dev shares the one file per server, so signing in once covers them
all. Any program running as the user can read a Dev key; that key only reaches
a development server.
