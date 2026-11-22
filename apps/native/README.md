# Cloudstash native app (prototype)

A native Cloudstash client built with [Rune](https://github.com/anomalyco/rune). It is a
standalone Cargo workspace: nothing in the Bun workspace builds or imports it.

So far it does one thing: sign in through the browser and show who is signed in.

## Run

```sh
cd apps/native
cargo run                                         # against https://cloudstash.dev
CLOUDSTASH_URL=http://127.0.0.1:3000 cargo run    # against a local dev server
cargo test                                        # the sign-in flow against a stand-in server
```

Build output stays in `apps/native/target/` (gitignored). Use the dev profile only, so there is
one set of artifacts; `cargo clean` removes it.

## How sign-in works

The app pairs the same way the Raycast and Chrome extensions do: the signed-in web app mints an
API key for it.

1. The app listens on `http://127.0.0.1:53127/callback` and opens `/connect/native` in the
   system browser with a random `state` and a PKCE challenge.
2. The page signs the person in with Google if needed, then asks the server for a one-time code
   bound to the challenge and sends the browser to the loopback address with it.
3. The app exchanges the code and its PKCE verifier at `/api/connect/native/exchange` for an API
   key, and sends the browser back to `/connect/native` to show the result.
4. The key goes into the system keychain (service `dev.cloudstash.native`). On the next launch
   the app checks it against `/api/connect/native/account`. Signing out revokes it.

## Headless snapshots

Debug builds render a scene without opening a window, the keychain, or the network:

```sh
target/debug/cloudstash-native --snap out.png --scene signed-in   # signed-out, waiting, signed-in
```
