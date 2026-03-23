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
