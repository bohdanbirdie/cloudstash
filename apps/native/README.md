# Cloudstash native app (prototype)

A native Cloudstash client built with [Rune](https://github.com/anomalyco/rune). It is a
standalone Cargo workspace: nothing in the Bun workspace builds or imports it.

So far it does one thing: sign in through the browser and show who is signed in.

## Run

```sh
cd apps/native
scripts/run.sh                                        # against https://cloudstash.dev
CLOUDSTASH_URL=http://127.0.0.1:3000 scripts/run.sh   # against a local dev server
cargo test                                            # the sign-in flow against a stand-in server
```

`scripts/run.sh` builds the app, wraps it in `target/Cloudstash.app`, registers the
`cloudstash://` scheme with Launch Services, and opens it. A bare `cargo run` works for the UI
but can't receive the sign-in link. Every build output stays in `apps/native/target/`
(gitignored); `cargo clean` removes it, bundle included.

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

## Headless snapshots

Debug builds render a scene without opening a window, the keychain, or the network:

```sh
target/debug/cloudstash-native --snap out.png --scene signed-in   # signed-out, waiting, signed-in
```
