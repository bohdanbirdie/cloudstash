# Complete Vite+ migration

Finished Vite+ migration started in PR #15. Fixed ~133 pre-existing type-aware lint errors (no-unsafe-type-assertion, no-floating-promises, etc.).

Remaining deferred items:

- Upgrade to vitest 4 when @cloudflare/vitest-pool-workers supports it
- Re-enable pre-commit hooks when vite-plus fixes TS config loading in staged context
- Remove pnpm-lock.yaml gitignore when vite-plus adds bun support
