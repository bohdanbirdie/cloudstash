import { type Auth } from "./auth";
import { type ChatAgentDO } from "./chat-agent";
/// <reference types="@cloudflare/workers-types" />
import { type SyncBackendDO } from "./index";
import { type LinkProcessorDO } from "./link-processor";

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

export interface Env {
  SYNC_BACKEND_DO: DurableObjectNamespace<SyncBackendDO>;
  LINK_PROCESSOR_DO: DurableObjectNamespace<LinkProcessorDO>;
  // Binding name must match what useAgent({ agent: "chat" }) expects
  // The agents SDK converts "chat" → "Chat" for env lookup
  Chat: DurableObjectNamespace<ChatAgentDO>;
  AI: Ai;
  DB: D1Database;
  SYNC_RATE_LIMITER?: RateLimit;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  ENABLE_TEST_AUTH?: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
  TELEGRAM_KV: KVNamespace;
  RESEND_API_KEY: string;
  EMAIL_FROM: string;
  OPENROUTER_API_KEY: string;
  USAGE_ANALYTICS?: AnalyticsEngineDataset;
  CF_ACCOUNT_ID: string;
  CF_ANALYTICS_TOKEN: string;
}
