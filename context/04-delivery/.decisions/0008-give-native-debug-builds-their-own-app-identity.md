# Give native debug builds their own app identity

Status: accepted

## Context

The maintainer wants the released Mac app and a development build open on the
same Mac at once, the development build with a different icon, the release
always on the production API, and no staging variant. Until now both were one
app to macOS: bundle id `dev.cloudstash.native`, the `cloudstash://` link
scheme, one data folder, keychain service and log. Two bundles claiming one
scheme get each other's sign-in links, `open` on one bundle id brings forward
whichever copy runs, and `scripts/run.sh` quit any process named
`cloudstash-native`, the installed app's included. Every debug build already
skipped updates, and only `release.sh` (release profile) makes shipped apps.

## Evidence and Argument

macOS keeps apps apart by bundle id: Launch Services, window state in
`NSUserDefaults`, login items and the Dock all key on it, and deep links go
by scheme. So a second identity needs its own bundle id and scheme, and the
app's own folders (Application Support, Caches, keychain service) can take
their names from that id. The sign-in page chose the scheme itself, so it has
to learn which app asked; an allow-listed `app=dev` parameter keeps every
other value on the released app's scheme. The release's identity has to stay
byte-for-byte the same so the installed 0.1.0 keeps its data, keychain item
and updates; `scripts/bundle.sh` writes the same Info.plist as before when
not asked for `dev`.

## Options

| Option                                                   | Tradeoffs                                                                                                                |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Debug build is Cloudstash Dev (`cfg!(debug_assertions)`) | No flags to remember; matches the existing "debug builds don't update" rule; a local release-profile build is production |
| A `dev` Cargo feature                                    | Can make an optimised dev build, but a plain `cargo build` or `cargo test` would silently be production                  |
| Runtime switch (environment or bundle id read at launch) | One binary, but the identity lives in two places that can disagree, and a release could be talked into dev paths         |
| Keep one identity, separate only data by server          | Smallest change, but deep links, `open`, quitting and the Dock still mix the two apps                                    |

## Decision

A debug build is Cloudstash Dev and a release build is Cloudstash, chosen at
compile time in `apps/native/src/flavor.rs`. Dev has bundle id
`dev.cloudstash.native.dev`, executable `cloudstash-dev`, scheme
`cloudstash-dev`, its own Application Support, Caches and keychain service
under that id, `cloudstash-dev.log`, a blue tile icon and a blue menu bar
ball (`scripts/brand.py`), defaults to `http://127.0.0.1:3000`, and never
checks for updates. The release ignores `CLOUDSTASH_URL` and always uses
`https://cloudstash.dev`. `/connect/native` opens `cloudstash-dev://` only
for `app=dev`. Revisit if a staging app or an optimised dev build is wanted;
a Cargo feature would then pick the identity instead of the profile.
