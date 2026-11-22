# Cloudstash native app (prototype)

A native Cloudstash client built with [Rune](https://github.com/anomalyco/rune). It is a
standalone Cargo workspace: nothing in the Bun workspace builds or imports it.

So far it does one thing: sign in through the browser and show the signed-in library.

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

The app is a public OAuth client of Cloudstash's own authorization server, the one remote MCP
clients use. No backend change is involved.

1. It registers itself once (dynamic client registration) with the redirect
   `http://127.0.0.1:53127/callback` and remembers the client id in
   `~/Library/Application Support/dev.cloudstash.native/client.json`. The id is not a secret.
2. It opens the system browser at the authorization endpoint with a PKCE challenge. You sign in
   with Google on the Cloudstash site and approve access there.
3. The browser is redirected to the loopback address, where the app is listening. The app checks
   the `state` value and exchanges the code for tokens.
4. The refresh token goes into the system keychain (service `dev.cloudstash.native`). The
   five-minute access token stays in memory. On the next launch the app refreshes silently.

The app requests `openid offline_access links:read`. The server offers no profile or email
scope, so the window shows the user id, the library id, and the latest links, read through `/mcp`
with the access token.

## Headless snapshots

Debug builds render a scene without opening a window, the keychain, or the network:

```sh
target/debug/cloudstash-native --snap out.png --scene signed-in   # signed-out, waiting, signed-in
```
