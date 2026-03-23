import type { Auth } from "./auth";
import type { ChatAgentDO } from "./chat-agent";
/// <reference types="@cloudflare/workers-types" />
import type { SyncBackendDO } from "./index";
import type { LinkProcessorDO } from "./link-processor";
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

export interface Env extends Cloudflare.Env {
  LINK_QUEUE: Queue<LinkQueueMessage>;
  SYNC_BACKEND_DO: DurableObjectNamespace<SyncBackendDO>;
  LINK_PROCESSOR_DO: DurableObjectNamespace<LinkProcessorDO>;
  Chat: DurableObjectNamespace<ChatAgentDO>;
  ENABLE_TEST_AUTH?: string;
  GOOGLE_BASE_URL?: string;
  EMAIL_FROM: string;
}
