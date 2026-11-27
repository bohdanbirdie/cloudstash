# Delivery — Spec

This document specifies repository composition, build provenance, and release
flow. It builds on [requirements.md](./requirements.md).

## Status

Active.

## Repository Composition

```text
cloudstash/                         Bun + Vite+ application
  apps/extension/                  WXT Chrome extension (Bun workspace)
  apps/native/                     experimental Rune macOS app (standalone Cargo workspace)
  vendor/livestore/                read-only upstream reference submodule
  local/raycast-extension/         ignored external npm checkout
```

The root uses Bun 1.4.x, Vite+, TypeScript, Vitest, and Alchemy. Dependency
versions are exact where compatibility is sensitive.
The root and extension typechecks use the Effect-patched TSRS build shipped by
`@effect/tsgo`, with both wrapper and compiler version pinned. TypeScript and
Effect diagnostics share one root compiler pass in the quality job; the unit
job does not repeat it. The JavaScript `@effect/language-service` package and
its TypeScript patch remain for editors using TypeScript 6, not for CI checks.
See [decision 0005](./.decisions/0005-use-effect-patched-tsrs.md).
Vite+ checks, fixes, and staged checks also run through the wrapper with
`--tsrs-lint=7.1.0-beta.tsrs3`, replacing Oxlint's Go type-aware backend with
Effect-patched TSRS while retaining the existing lint rules and JS plugins.
The Raycast extension is a separate published repository and shares only HTTP
contracts.

`apps/native/` is an experimental native client. It is its own Cargo workspace
with its own lockfile and gitignored `target/`, pinned to a prerelease Rune
revision; nothing in the Bun workspace builds or imports it, and CI builds it
only to run its LiveStore contract tests. It shares only HTTP contracts with
the worker: the native pairing
flow in [auth-and-tenancy](../02-system/02-auth-and-tenancy/spec.md#pairing-flows)
and API-key LiveStore sync. Card pictures are kept as small local copies in each
library's folder and deleted with it on sign-out, or at the next launch that
finds no session; at most 80 MB of them are kept decoded in memory, per
[decision 0006](./.decisions/0006-bound-native-picture-memory.md). A click on a card opens a preview of the link over the grid,
with the sidebar still usable. The preview shows a link's summary, when it has
one, in a labelled inset above the page's own text, so the two never read as one.
A click on the preview or ↵ opens it fully in
the content area, and Esc steps back. Feed shows each link much as the preview
does, its picture at the preview's 16:9 rather than the grid cards' 16:11, so a
click on a Feed card opens the link fully at once. ⌘-click opens the link in the browser.
Saved links open in the browser only when they are web
addresses. The window's page is one `Place` value (a library state or a space
by id), changed only through `nav::go`, so every navigation (sidebar, palette,
⌘1 to ⌘4 for the states in sidebar order, later menus and links) takes the
same path. A navigation swaps the page at once, with no fade between the two
pages' cards; a zoom change stays animated. Cards fly to their new places above
the grid at full strength, and drop into the grid's layer only while a preview
is open, so a preview opened mid-flight is on top from its first frame. A title the old zoom didn't show (coming from Pictures) fades in
as its card lands, not at its place while the picture is still flying there.
The title flies right under its picture, and the summary flies with it,
fading in or out on the way. Between Feed and a grid the words don't fly,
since Feed sets them larger and wider and text can't scale in flight: the old
ones fade where they were and the new ones fade in as the picture grows into
place. Feed's narrow, centred column is a column of its own rather than the
grid's resized, so nothing in it slides over from where the grid was. In every zoom the site row sits under the picture. The zoom is picked in the toolbar's Display panel, as Linear's: four tiles, each a miniature of its layout, under a Display button or ⇧V. It stays open while a layout is picked, and a press outside, Esc or ⇧V closes it; ← and → step the layout while it's open, and 1 to 4 and ⌘+ and ⌘− work with it closed too. Opened by key it appears at once, by click it grows from the button. Its sort and filter rows are shown but do nothing yet. ⌘F finds in the page, as Linear's find in view: a "Search <page>…" field, with ✕ to clear it once it has words, takes the toolbar's trailing edge and the page keeps only the links every typed word matches as a run of letters (⌘K's looser letters-in-order matching would only puzzle in a page that isn't ranked), in the page's own order. Each found card says why it's there: the matched letters sit on a soft plate in its title and site, and a match the card doesn't show (description, summary, tag or URL) takes the summary's place as a line naming the field; Titles shows no summary, so there it takes the site's place, starting at the matched word, and a found card stays as tall as any other. In Pictures it joins the tooltip. ↵ keeps the words and hands the keys back to the grid, and Esc, or leaving the field empty, puts it away. It appears in its place out of a blur and a fade, rather than travelling in, and goes at once however it closes. Going to another page clears it, since a search was for the page it was typed on. When its words match nothing on the page, the page shows two link cards fanned out with a dashed blank one in front, then what was searched for and where, what search looks at (titles, summaries, tags and addresses), and the way on: the first other page whose links match, in sidebar order with All links last, which opens with the same words, and Clear search. A page that is empty for any other reason keeps its plain note. Letter shortcuts (⌘F, ⌘K, ⌘B, ⇧V and the rest) work whatever keyboard layout is on: on one with no Latin letters, such as Ukrainian, the key where the letter sits on a US keyboard counts, as it does in the menu bar. Between launches AppKit keeps the window's position and size, and
`ui.json` in the app's folder keeps the page, the zoom (Pictures, Titles,
Summaries or Feed) and the sidebar's state and width. Each value is checked as it loads and an
unknown one falls back to its default, so no saved state can strand the app;
the file is replaced atomically, and sign-out forgets the page.
Settings is a window of its own (⌘, or Cloudstash ▸ Settings…) with General
(the account, Sign Out behind a confirmation, the theme, Open at login, and
the Dock and menu bar icons), Updates (shown only, until the updater lands)
and About. Open at login registers the app as a macOS login item; macOS keeps
it, so Settings reads it back each time it opens. The theme sets the application's appearance, so both
windows follow it. The app can hide its Dock icon only while its menu bar icon
(the logo; a click brings the window forward) shows, so it can always be
found; `ui.json` keeps the theme and both icons across sign-out and restores a
Dock icon if neither was saved on.
The whole-window screens before the library (sign in, waiting for the browser,
the sign-in error, signing out, opening the library, must-update) sit on the
web sign-in card's dot grid, 1pt dots every 18pt, in faint grey; each dot
brightens and dims slowly out of step with its neighbours, and the grid fades
out toward the window's edges. Reduce Motion holds it still.
After a sign-in the app waits up to 10 seconds for the library to catch up with
the server, then opens with what the Mac has. The logo moves, grows and turns
as it always does; if the wait passes 3 seconds one dim word, "Syncing",
blurs in near the bottom of the window, where it stays put while the logo
grows, with a soft light sweeping across it. There is no count,
bar, percentage or ellipsis. The word blurs out as soon as the links arrive,
before the logo opens into the library, so a quick download shows nothing
extra. If the app opens before it has caught up,
the toolbar says "Syncing" in the same way until the server's
last page arrives (the server marks it `NoMore`). Under Reduce Motion both
lines stay still. In a debug build `CLOUDSTASH_SLOW_SYNC=<ms>` holds back each
page of that catch-up, to see the slow case against a fast local server.

Local provider configuration is represented by committed 1Password references
in `.env.example`. `bun run env:sync` explicitly and atomically materializes
the ignored `.env` with mode `0600`; failed resolution preserves the
previous local file and no plaintext backup is retained. Normal development
starts do not contact 1Password.

Local dev state is per checkout: `alchemy dev` keeps D1, KV and every Durable
Object under `<checkout>/.alchemy` (`local/` plus `state/`, which names the DO
folders), so a new worktree starts with an empty library. Test data moves as a
plain links file instead of shared state, because a branch's D1 migration or
events written into shared state break every other branch.
`bun scripts/dev-seed.ts export` writes the signed-in library to
`local/dev-data/links.jsonl` (one link per line: url, page details, summary,
tags, done/failed), and `seed` writes it into an empty library over `/sync`
with today's events. Seeded links arrive processed and already notified, so no
page fetch, AI summary or source notification runs. The account is a test
account (`ENABLE_TEST_AUTH=true`) or the session in `SEED_COOKIE`.
The dev server seeds on its own: on each library's first `/sync` connection in
a server run it runs `seed --if-empty` with that connection's session, so any
account that signs in, Google included, finds the links. It lives only in
`vite serve` (not in builds, Vitest or Storybook), skips a library that has
ever had a link, logs one line and starts empty when the links file is missing,
and `DEV_SEED=off` turns it off. See
[decision 0010](./.decisions/0010-seed-empty-local-libraries-from-the-dev-server.md).
The Mac app syncs with an API key rather than a cookie, so the plugin also
seeds when a signed-in browser mints that key (`POST /api/connect/native`).

Every worktree runs its own dev server at once. `bun run dev`
(`scripts/dev.ts`) takes the first free port from 3000, starts a local
stand-in for Google (`vercel-labs/emulate`, in-process) with two test
accounts, `testuser@gmail.com`, whose library gets the test links, and
`empty@cloudstash.test`, whose library is never filled (`tools/dev-seed/accounts.ts`),
and runs `alchemy dev` on `127.0.0.1` at that port, failing rather
than moving. Sign-in takes the production OAuth path against the stand-in;
local accounts are keyed by email under `urn:cloudstash:local-google`, since
the stand-in mints new subjects each start. The local `BETTER_AUTH_URL` is
derived from the port, the variable `GOOGLE_EMULATOR_URL` exists on local
stages only and is used only between loopback addresses, and a loopback
server names its cookies `cloudstash-<port>` because browsers share cookies
across ports. `DEV_GOOGLE=real` keeps real Google, which accepts only port 3000. The server writes its address to `.alchemy/dev-url` while it runs. Per
[decision 0011](./.decisions/0011-run-worktrees-side-by-side.md).

## LiveStore Version

Every `@livestore/*` dependency in the application and extension pins the same
published upstream snapshot, `0.0.0-snapshot-<upstream-commit-sha>`. Upstream
publishes one snapshot for each commit on `main`. Dev, tests, and production
builds all resolve LiveStore from these installed packages; there is no Vite
alias. `vendor/livestore` is a submodule at the same upstream commit, kept only
as a source reference: nothing imports it, nothing installs its dependencies,
and builds and CI do not check it out. The rationale is recorded in
[decision 0004](./.decisions/0004-consume-published-livestore-snapshots.md),
which supersedes [decision 0001](./.decisions/0001-vendor-upstream-livestore-source.md).

The current pin is snapshot `4bedac6261d75bf3bde1ada2bdf5bdc21e850bea`,
paired with the Effect `4.1.4` cohort in both the web app and extension.
Snapshot upgrades select a fully published package cohort, not a partially
published upstream revision or a newer Effect version outside that cohort.
The general seven-day release-age gate remains enabled. The exact-pinned
Effect cohort and matching LiveStore package closure are excluded in
`bunfig.toml` so an intentional snapshot upgrade can install freshly published
packages; unrelated dependencies remain subject to the age gate.
This upgrade crosses LiveStore's switch from Effect AST hashes to canonical
state fingerprints. The first open rebuilds materialized state once from the
retained event log, including server-side clients in Durable Objects; deployment
must account for the associated row-write usage. It is not a D1 migration or an
event-log reset. See the
[upstream release notes](https://github.com/livestorejs/livestore/blob/4bedac6261d75bf3bde1ada2bdf5bdc21e850bea/CHANGELOG.md) and
[upgrade decision](./.decisions/0003-adopt-published-livestore-effect-cohort.md).

## Build

`bun run build` runs the same Vite build that Alchemy runs during a deploy,
with Alchemy's Cloudflare Vite plugin, then verifies the bundle. A Vite plugin
prerenders public pages at the end of every build. The Worker (`ssr`)
environment is Oxc-minified while client build defaults remain independent.
Bundle certification checks no known Effect v3 version
string, the SchemaBinary RPC runtime and absence of the legacy msgpack runtime
and native extraction binding, one distinct React
version string, and raw/compressed Worker upload budgets. CI boots the
generated minified Worker for a D1/auth/SyncBackendDO handshake. These are
targeted regression indicators, not proof that no same-version duplicate
runtime exists.

Cloudflare Assets serves static output with Worker-first exceptions declared
once in `worker.config.ts`, which `alchemy.run.ts`, the standalone Vite build,
and the local test runtimes (`tools/local-worker.ts`) share.

## CI and Contract Certification

`bun run check:intent` scans only Cloudstash's `context/` tree and enforces
required node pairs, structure, links, IDs/refinements, statuses, companion
record shape, and evidence-link hygiene. Semantic quality remains review work.

The PR checks workflow uses a frozen Bun install. Quality, unit, Worker E2E,
and extension/production-build certification run as parallel jobs on Bun
(`bun --bun run`, no Node setup), for pull requests targeting `staging` or
`main`; see [decision 0006](./.decisions/0006-run-ci-and-repo-scripts-on-bun.md). Every workflow job has a
timeout, so a hung step fails the run instead of holding it open. Merges are not re-certified;
the deploy workflows start on each push to `staging` and `main`.
The workflow has no Markdown path ignore, so Intent-only changes trigger CI.
Pricing reconciliation remains outside the CI release evidence; see
[DELTA-020](../.delta/DELTA-020-release-path-can-deploy-uncertified-artifacts.md).

## Migrations and Deploy

All infrastructure is declared in `alchemy.run.ts`; see
[decision 0005](./.decisions/0005-manage-infrastructure-with-alchemy.md). D1
migrations are generated by Drizzle and reviewed, and Alchemy applies pending
ones as part of a deploy. Alchemy reconciles D1, and so applies migrations,
before it builds and uploads the Worker, so the deploy workflow builds the
Worker and runs `verify-bundle` first and deploys only if it passes. The
minified-bundle smoke test (`bun run test:bundle`) runs in PR checks and
locally, not in the deploy workflow. Drizzle v1 writes one
folder per migration in `drizzle/migrations/`, the layout Alchemy reads. Alchemy records applied migrations in
`__alchemy_migrations`; on first contact it copies Wrangler's `d1_migrations`
history by file name and leaves that table untouched. Durable Object
classes are declared as Worker bindings and deploy through Cloudflare's
`exports` map. A change to existing DO-owned LiveStore persistence requires the
upstream persistence format/version strategy, not only local state cleanup.

Production is the `prod` stage. `bun run deploy` deploys it with the shared
Cloudflare state store; the GitHub Actions deploy workflow runs it on pushes to
`main` with secrets from the `production` environment. Production resources
are protected: a plan that would delete or replace one fails before applying.
Staging is the `staging` stage, on `staging.cloudstash.dev` with its own
resources. Feature pull requests target the `staging` branch, and each merge
into it deploys the stage with secrets from the `staging` environment; the
maintainer can also deploy any branch to it by hand. A `staging` → `main` pull
request, merged with a merge commit, releases to production. Its resources are not protected. Preview stages are
not defined.

Remote migration/deploy/secret operations are maintainer-controlled. Agent and
ordinary local commands stop at local migrations, checks, builds, and explicit
review artifacts unless the maintainer separately authorizes a remote action.

## Native App Delivery

The Mac app's version is `apps/native/Cargo.toml`'s. A release build is
Cloudstash, which always talks to `https://cloudstash.dev`; a debug build
(`scripts/run.sh`) is Cloudstash Dev, which talks to its worktree's dev server
(the address in `.alchemy/dev-url`) unless `CLOUDSTASH_URL` says otherwise and
never updates. Only Dev shows the
frame meter and download readings at the foot of the sidebar. The two differ in
bundle id (`dev.cloudstash.native` / `dev.cloudstash.native.dev`), name,
executable, blue icon and menu bar ball, data and caches (named by the
bundle id), where the sign-in key is kept (the release's keychain item; a
file only the user can read in Dev's own folder, so a fresh worktree's build
never asks for the login password, per
[decision 0009](./.decisions/0009-keep-the-native-dev-key-in-a-file.md)), log file (`cloudstash.log` /
`cloudstash-dev.log`) and sign-in link scheme (`cloudstash` /
`cloudstash-dev`), so both run on one Mac at once, per
[decision 0008](./.decisions/0008-give-native-debug-builds-their-own-app-identity.md).
`scripts/run.sh` gives each worktree's Dev its own instance of all of these
(id from the worktree's path: `dev.cloudstash.native.dev.<id>`,
`cloudstash-dev-<id>`, `cloudstash-dev-<id>.log`, named "Cloudstash Dev ·
<branch>"), quits only that worktree's copy, and draws the dev server's port onto the bottom
of its icon as a red counter (`scripts/port-icon.swift`); the copy's dev meter shows the port too,
and clicking it opens the web app, so every worktree's copy runs at once, per
[decision 0011](./.decisions/0011-run-worktrees-side-by-side.md). Each worktree keeps its own
`apps/native/target`, but `scripts/run.sh` starts a worktree's first build from a
copy-on-write clone of the compiled dependencies in
`~/Library/Caches/cloudstash/native-debug`, which every run replaces with the
dependency units its own build used, so worktrees share those blocks and a new one
builds only the app's crate; off APFS, or on another volume, it builds cold, per
[decision 0012](./.decisions/0012-share-native-dependencies-between-worktrees.md). When `main` gets a version with no `native-v<version>` tag,
`native-release.yml` builds a universal app (`apps/native/scripts/release.sh`),
signs it with the maintainer's Developer ID and hardened runtime, notarizes and
staples it and its disk image, and publishes them as the repository's latest
GitHub Release with an update zip and `latest.json` (version, zip address,
Ed25519 signature, and `minimum-version` from `Cargo.toml`'s
`[package.metadata.cloudstash]`). The signing certificate, notary key and update key are
secrets of the `native-release` environment, which only `main` may use; the
update key's public half is in `src/update.rs`.

Installed apps read the latest release's `latest.json` at launch and every
four hours and download a newer version in the background; with Settings'
Automatic updates off they only download when Check for Updates asks. An
update is offered only after its zip's signature verifies, its bundle id and
version match, and `codesign` confirms the maintainer team's Developer ID. The
sidebar's update row asks before restarting; restarting swaps the app in place
with two renames, rolled back on failure. A copy that can't be replaced in place
(translocated, read-only) doesn't check. Per
[decision 0007](./.decisions/0007-update-the-native-app-from-github-releases.md).

A version too old to run shows a whole-window must-update screen, signed in or
out, when either:

- the feed's `minimum` is newer than it (the maintainer raises
  `minimum-version` with the version when older apps would break), or
- its library receives a newer version of an event it materializes (`v3.X`
  beside its `v1.X` and `v2.X`). Events it doesn't materialize at all stay
  skipped, so web-only events never block it. The finding is kept in the
  library folder, so restarting the same version blocks again.

A library folder opened by a different app version drops its state database
first, and boot replays the eventlog, so events an older version skipped are
applied after updating.

## Extension Delivery

The Chrome extension builds and zips from `apps/extension`; a manual GitHub
workflow submits to Chrome Web Store using repository secrets. Manifest IDs and
allowed production/dev origins remain aligned with Worker configuration. The web
Worker and store extension can deploy independently, so protocol changes remain
backward-compatible across store review lag.
