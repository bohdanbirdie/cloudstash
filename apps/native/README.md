# Cloudstash native app (prototype)

A native Cloudstash client built with [Rune](https://github.com/anomalyco/rune). It is a
standalone Cargo workspace: nothing in the Bun workspace builds or imports it.

So far it does one thing: sign in through the browser and show who is signed in.

## Run

```sh
cd apps/native
scripts/run.sh                                          # this worktree's Cloudstash Dev against its `bun run dev`
CLOUDSTASH_URL=https://cloudstash.dev scripts/run.sh    # against another server
cargo test                                              # the sign-in flow against a stand-in server
```

`scripts/run.sh` builds the app, wraps it in `target/Cloudstash Dev.app`, registers this
worktree's own `cloudstash-dev-<id>://` scheme with Launch Services, and opens it. Each
worktree's copy has its own name, data, sign-in and log, so several run at once; the Dock
badge shows which dev server port each one talks to. A bare `cargo run` works for the UI
but can't receive the sign-in link. Every build output stays in `apps/native/target/`
(gitignored); `cargo clean` removes it, bundle included.

## Logs

The app writes warnings, errors and every panic (with its thread and backtrace) to
`~/Library/Logs/Cloudstash/cloudstash.log`, which Console.app lists under Log Reports. When
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

1. The app saves a random `state` and a PKCE verifier to
   `~/Library/Application Support/dev.cloudstash.native/pending-sign-in.json` (mode `0600`) and
   opens `/connect/native?state=…&code_challenge=…` in the default browser.
2. The page shows the normal Google sign-in if the browser has no session. Once signed in, it asks
   `POST /api/connect/native` for a one-time code bound to the challenge and opens
   `cloudstash://auth/callback?code=…&state=…`.
3. macOS brings the app forward, or launches it. The app accepts the link only for the sign-in it
   started (matching `state`, under ten minutes old, used once) and redeems the code with its
   verifier at `POST /api/connect/native/exchange` for its own API key.
4. The key goes into the system keychain (service `dev.cloudstash.native`). On launch the app
   checks it against `GET /api/connect/native/account`. Signing out revokes it.

Only one build can own `cloudstash://` at a time: the most recently registered bundle wins.

## Look

The window is the web's sign-in card (`AuthSplitCard` with `StatusCard` from
`src/routes/connect/native.tsx`) at its mobile width, ported one-to-one:

- Colours: `src/theme.rs` holds the `src/styles.css` tokens in their original OKLCH, light and dark.
- Type: `fonts/` are `@fontsource-variable/noto-sans` 5.2.10's `wght` subsets converted to TTF
  (OFL, `fonts/OFL.txt`), drawn without font smoothing as the web's `antialiased` does.
- Icons: `src/icons.rs` holds lucide's paths and the Cloudstash knot.
- Spacing: Tailwind's values in points (`p-7` is 28, `mt-5` 20, `h-8` 32).

Change the web first, then mirror it here.

## Headless snapshots

Debug builds render a scene without opening a window, the keychain, or the network:

```sh
target/debug/cloudstash-native --snap out.png --scene signed-in   # signed-out, error, waiting, finishing, signed-in
```
