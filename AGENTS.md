# Intent Layer (`context/`)

`context/` is Cloudstash's always-current durable product and system contract.
Read `context/intuition.md` for the map and `context/spec.md` for artifact and
lifecycle rules before changing behavior.

- Update the owning Intent node when behavior or a contract changes.
- Put consequential rationale in the node's `.decisions/`, confirmed
  implementation/contract drift in `.delta/`, unresolved design uncertainty in
  `open-questions.md`, and future direction in `roadmap.md`.
- Keep plans and status in `docs/kanban.md` / `docs/todos/`, not in Intent.
- `vision.md` and `requirements.md` are protected; confirm goal or guarantee
  changes with the maintainer.
- Run `bun run check:intent` after editing `context/`.
- `vendor/livestore/context/` is upstream LiveStore's separate Intent corpus and
  is not part of Cloudstash's tree.

# LiveStore events (`src/livestore/schema.ts`)

Deployed events are append-only (`CS.SYS.DATA-R05`); the contract is in
`context/02-system/01-data/spec.md` § Event Evolution.

- Never change, rename, or delete a deployed event or any of its fields, and
  never change its scope. Add a new version instead (`v1.TagRenamed` →
  `v2.TagRenamed`) and keep the old event and its materializer.
- Never hand-edit generated contract files (`src/livestore/contract/manifest.json`)
  or the wire goldens (`src/livestore/__tests__/fixtures/event-wire-goldens.json`).
- After changing the schema, run `bun run contract`. It regenerates the
  manifest and compares events with `origin/staging` (run
  `git fetch origin staging` first).
- Keep materializers pure: no clock, randomness, or id generation; every input
  comes from the event payload.
- Never edit `.github/workflows/livestore-event-gate.yml`,
  `scripts/livestore-event-contract.ts`, `src/livestore/contract/*.ts`, or
  `tools/oxlint-rules/livestore.mjs` to make a check pass.
- A contract failure, or a gate waiting on the `livestore-breaking-change`
  approval, means stop and ask the maintainer. Do not regenerate files or work
  around it.

# Database migrations

- Never edit a Drizzle-generated migration SQL file. Generated migrations are
  immutable schema artifacts.
- Put handwritten backfills or other data changes in a separate migration made
  with `bun run db:generate:custom -- --name <name>`.
- Use `bun run db:generate` for schema migrations so the generated SQL is
  recorded before any handwritten change can be introduced.
- Run `bun run check:migrations` before committing migration changes.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, but it invokes Vite through `vp dev` and `vp build`.

## Commands

- `vp dev` — Start the development server
- `vp build` — Build for production
- `vp preview` — Preview production build
- `vp check` — Run formatting, linting, and type-checking
- `vp check --fix` — Auto-fix formatting and lint issues

## Configuration

All Vite+ configuration lives in `vite.config.ts`, including:

- `fmt` — Formatting options (oxfmt)
- `lint` — Linting rules (oxlint)
- Standard Vite config (plugins, resolve, server, etc.)

<!--VITE PLUS END-->
