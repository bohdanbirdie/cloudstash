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
