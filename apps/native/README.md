# Cloudstash for Mac

The native Mac client for Cloudstash, built with [Rune](https://github.com/anomalyco/rune). It
signs in through the browser, syncs the library over LiveStore and shows it in the same Inbox,
Completed, Archive and All views as the web app. It is a standalone Cargo workspace: nothing in the Bun workspace builds or
imports it.

Releases are built by `.github/workflows/native-release.yml` when the version in `Cargo.toml`
changes on `main`, and installed copies update themselves from GitHub Releases.

## Run

```sh
cd apps/native
scripts/run.sh                                          # this worktree's Cloudstash Dev against its `bun run dev`
CLOUDSTASH_URL=https://cloudstash.dev scripts/run.sh    # against another server
cargo test                                              # the app's tests
```

`scripts/run.sh` builds the app, wraps it in `target/Cloudstash Dev.app`, registers this
worktree's own `cloudstash-dev-<id>://` scheme with Launch Services, and opens it. Each
worktree's copy has its own name, data, sign-in and log, so several run at once; its icon
and its dev meter show which dev server port each one talks to, and clicking the port in the
meter opens the web app. A bare `cargo run` works for the UI
but can't receive the sign-in link. Every build output stays in `apps/native/target/`
(gitignored); `cargo clean` removes it, bundle included.

## Logs

The app writes warnings, errors and every panic (with its thread and backtrace) to
`~/Library/Logs/Cloudstash/cloudstash.log` (`cloudstash-dev-<id>.log` for a worktree's Cloudstash Dev), which
Console.app lists under Log Reports. When
`scripts/run.sh` opens the app, anything it prints goes there too. Past 5 MB the file moves to
`cloudstash.old.log` at the next launch. A crash on the sync thread also shows as an error in the
toolbar instead of leaving the library loading.

```sh
tail -f ~/Library/Logs/Cloudstash/cloudstash.log
```

## The LiveStore contract with the web app

`src/livestore/contract.rs` checks this app against the web's
[LiveStore contract](../../context/02-system/01-data/spec.md#livestore-contract): every native table must
have the columns `schema.json` lists, and replaying each scenario in `scenarios/` through the
native materializers must write the rows the scenario expects, step by step. Events this app
doesn't handle must change none of its tables. It also runs the links query on the replayed
library.

```sh
bun run contract                # at the repo root, after changing the web schema
cargo test livestore::contract  # here
```

CI runs both in `.github/workflows/livestore-contract.yml`.

## How sign-in works

The usual desktop pattern: the browser signs in, then hands the app a one-time code through a
deep link.

1. The app saves a random `state` and a PKCE verifier to `pending-sign-in.json` (mode `0600`) in
   `~/Library/Application Support/<bundle id>/` and
   opens `/connect/native?state=…&code_challenge=…` in the default browser.
2. The page shows the normal Google sign-in if the browser has no session. Once signed in, it asks
   `POST /api/connect/native` for a one-time code bound to the challenge and opens the app's
   scheme, `cloudstash://auth/callback?code=…&state=…` for the release build.
3. macOS brings the app forward, or launches it. The app accepts the link only for the sign-in it
   started (matching `state`, under ten minutes old, used once) and redeems the code with its
   verifier at `POST /api/connect/native/exchange` for its own API key.
4. The release build keeps the key in the system keychain (service `dev.cloudstash.native`);
   Cloudstash Dev keeps it in a file only the user can read in its own folder. On launch the app
   checks it against `GET /api/connect/native/account`. Signing out revokes it.

The release build owns `cloudstash://`; each worktree's Cloudstash Dev registers its own
`cloudstash-dev-<id>://` scheme.

## Look

Colours come from `src/theme.rs`, which mirrors the `src/styles.css` tokens; the rules are in
[`context/01-product/spec.md`](../../context/01-product/spec.md#colour-and-depth). `fonts/` holds
Noto Sans (OFL, `fonts/OFL.txt`) and `src/icons.rs` holds the icons.

## Headless snapshots

Debug builds render a scene without opening a window, the keychain, or the network:

```sh
target/debug/cloudstash-native --snap out.png --scene signed-in
```
