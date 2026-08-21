// The Cloudflare Vitest plugin types `env` from "cloudflare:test" as `Cloudflare.Env`,
// so test-only bindings must be merged into that namespace (was `ProvidedEnv`).
declare namespace Cloudflare {
  interface Env {
    TEST_MIGRATIONS: string;
  }
}
