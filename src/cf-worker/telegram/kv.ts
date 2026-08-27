import { Effect } from "effect";

// Telegram retries non-2xx webhooks, so KV outages must escape user-facing catches.
export const telegramKvOrDie = <A>(operation: () => Promise<A>) =>
  Effect.tryPromise(operation).pipe(Effect.orDie);
