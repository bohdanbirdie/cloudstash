/// <reference types="@cloudflare/workers-types" />
import type { Auth } from "./auth";
import type { LinkQueueMessage } from "./link-processor/types";

type BetterAuthSession = NonNullable<
  Awaited<ReturnType<Auth["api"]["getSession"]>>
>;

export type AdminSession = BetterAuthSession & {
  user: BetterAuthSession["user"] & {
    role?: string | null;
    approved?: boolean;
  };
};

export interface HonoVariables {
  session: AdminSession;
}

// Bindings/secrets are generated into `Cloudflare.Env` by `bun run cf-typegen`.
// This interface only adds what typegen can't express:
export interface Env extends Cloudflare.Env {
  // Vars not declared in wrangler.jsonc / .dev.vars, so absent from typegen.
  ENABLE_TEST_AUTH?: string;
  GOOGLE_BASE_URL?: string;
  EMAIL_FROM: string;
  PUBLIC_URL?: string;
  // Typegen emits an untyped `Queue`; narrow to the message type.
  LINK_QUEUE: Queue<LinkQueueMessage>;
}
