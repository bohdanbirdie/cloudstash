import type { Env } from '../shared'

declare module 'cloudflare:test' {
  interface ProvidedEnv extends Env {}
}
