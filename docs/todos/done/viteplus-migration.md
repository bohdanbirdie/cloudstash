# Complete Vite+ migration

Finished Vite+ migration started in PR #15. Fixed ~133 pre-existing type-aware lint errors (no-unsafe-type-assertion, no-floating-promises, etc.).

Follow-up status after the Vite+ 0.2 toolchain upgrade:

- [x] Vitest 4 adopted with `@cloudflare/vitest-plugin`.
- [x] Bun is supported and owns the committed root lockfile; `pnpm-lock.yaml` is
      no longer ignored globally.
- [ ] Enable the configured staged checks with `vp hooks enable`. Vite+ now
      supports staged TypeScript config loading; this is a local repository
      setup action rather than an upstream blocker.
