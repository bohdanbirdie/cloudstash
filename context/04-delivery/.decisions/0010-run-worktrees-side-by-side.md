# Run every worktree's dev server and Mac app side by side

Status: accepted

## Context

Work happens in many git worktrees at once, each with its own dev server, and
the maintainer tests sign-in by hand in the browser and in Cloudstash Dev.
A dev server was pinned to port 3000: `BETTER_AUTH_URL` in the shared `.env`
said so, Google only accepts the callback addresses registered in its console,
and browsers share cookies across the ports of one host, so a second server's
sign-in overwrote the first one's session. Every Cloudstash Dev build had one
identity, so starting one quit every other worktree's copy.

## Evidence and Argument

Better Auth 1.7 takes any loopback port once `baseURL` matches the server
(checked with a throwaway script: one instance signed users up on 3000 and
51234 and refused a foreign origin). `vercel-labs/emulate` runs Google's OAuth
and OpenID endpoints in-process under Bun with no Docker, accepts any
redirect address when no client is registered, and completed the real
`/sign-in/social` → picker → `/callback/google` flow against Better Auth 1.7.0.
It gives a user a new subject on every start, so local accounts are keyed by
email under an issuer of their own. Cookie names take a prefix
(`advanced.cookiePrefix`). A Mac app's identity is its bundle id, executable,
link scheme, data folder and log, all of which `scripts/bundle.sh` writes and
`src/flavor.rs` reads; `NSDockTile.badgeLabel` labels the Dock icon.

## Options

| Option                                       | Tradeoffs                                                                                    |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Keep real Google, register more ports        | A console trip per port, ports still collide, cookies still shared                           |
| Automatic dev sign-in through the test login | Zero clicks, but skips the OAuth flow the maintainer tests by hand                           |
| A Google stand-in per dev server (emulate)   | The production OAuth path, any port, no extra service; one click on its picker               |
| A proxy with a name per worktree (portless)  | Separate cookies and readable addresses, but sudo for TLS and Google still rejects the names |
| A separate Google "Desktop app" client       | Unverified whether Google accepts any port for a web server's flow                           |

## Decision

`bun run dev` (`scripts/dev.ts`) is the only way to run the app locally. It
takes the first free port from 3000, starts emulate's Google with the git
user as its account, and runs `alchemy dev` with `PORT` and
`GOOGLE_EMULATOR_URL`; `DEV_GOOGLE=real` keeps real Google on 3000.
`alchemy.run.ts` derives the local `BETTER_AUTH_URL` from the port, binds
`127.0.0.1` with a strict port, and passes `GOOGLE_EMULATOR_URL` on local
stages only; the Worker uses it only when both addresses are loopback. A
loopback server names its cookies `cloudstash-<port>`. `scripts/run.sh` builds
one Cloudstash Dev per worktree (an instance id from the worktree's path)
against the address `bun run dev` writes to `.alchemy/dev-url`, quits only that
worktree's copy, and badges its Dock icon with the port. The sign-in page opens
`cloudstash-dev-<instance>://` for `app=dev-<instance>`. Revisit if emulate
stops tracking Google's endpoints or Google starts accepting any loopback port
for web clients.
