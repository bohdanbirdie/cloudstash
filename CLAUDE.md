# Cloudstash

Link saving app with AI-powered summaries. Full-stack TypeScript on Cloudflare Workers.

## Commands

Use **bun** (not npm) for all commands.

```bash
bun dev              # Start all dev processes in parallel
bun run dev:vp       # Vite+ dev server only (port 3000)
bun test             # Run all tests
bun run test:unit    # Unit tests only
bun run typecheck    # Type checking
bun run check        # Lint + format (Vite+) + Effect diagnostics
bun run fix          # Fix lint issues
```

**Linting:** Uses oxlint and oxfmt via Vite+ (NOT eslint). Don't use eslint-disable comments.

**NEVER run remote wrangler commands** (migrations, deployments, secrets, etc.). Local only:

```bash
bun run db:migrate:local   # OK - local migrations
bun run db:migrate:remote  # FORBIDDEN
bun run deploy             # FORBIDDEN
```

## Stack

- **Frontend:** React 19, Vite, TailwindCSS 4, TanStack Router, Zustand
- **Backend:** Cloudflare Workers, Hono.js, D1 (SQLite), Drizzle ORM
- **Real-time:** Livestore sync
- **AI:** Vercel AI SDK + OpenRouter
- **Auth:** Better Auth + Google OAuth

## Raycast Extension (separate repo)

`local/raycast-extension/` is a local clone of [bohdanbirdie/cloudstash-raycast](https://github.com/bohdanbirdie/cloudstash-raycast) (gitignored). It's a separate project with its own package manager (npm), dependencies, and tooling. Do NOT run bun commands inside it — use npm.

- **Server-side connect endpoints** live in this repo: `src/cf-worker/connect/`
- **Extension code** lives in the clone: `local/raycast-extension/src/`
- The only connection is the HTTP API contract (no shared imports)

## Local Repos

`local/` contains gitignored clones of external repos. Run `bun run sync` to clone/update all.

- `local/raycast-extension/` — Raycast extension (npm, separate repo)
- `local/readonly-llm-lookup/` — Reference implementations for external libraries (Effect, Livestore, etc.)

## Documentation

- `docs/specs/` — Feature specs and technical decisions. Check before implementing changes.
- `docs/` — Architecture docs (auth, worker resilience, telegram bot, etc.). Check before modifying related systems.

## Conventions

- Path alias: `@/*` maps to `src/*`
- Routes in `src/routes/_authed/` require authentication
- Database migrations: `bun run db:generate` then `bun run db:migrate:local`
- Avoid code comments unless absolutely necessary for complex logic
- No barrel files (index.ts re-exports) - import directly from source files
- **Patches:** When patching packages with pre-built dist files, patch `dist/*.js` directly (not just `src/*.ts`). Runtime imports from dist, not source.

<!-- effect-solutions:start -->

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `local/readonly-llm-lookup/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

<!-- effect-solutions:end -->

## Task Tracking

Private GitHub Project #1: `gh project item-list 1 --owner "@me"`

Use `gh project item-create 1 --owner "@me" --title "..." --body "..."` to add draft items.
Fields: Status, Type (Bug/Feature/Idea/Tech Debt), Priority (P0-P3).
