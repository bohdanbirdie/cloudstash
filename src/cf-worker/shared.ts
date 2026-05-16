import type { Auth } from "./auth";
import type { ChatAgentDO } from "./chat-agent";
/// <reference types="@cloudflare/workers-types" />
import type { SyncBackendDO } from "./index";
import type { LinkProcessorDO } from "./link-processor";
import type { LinkQueueMessage } from "./link-processor/types";
import type { AccountDeletionParams } from "./workflows/account-deletion";
import type { XBookmarkSyncDO } from "./x-sync";

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
  X_BOOKMARK_SYNC_DO: DurableObjectNamespace<XBookmarkSyncDO>;
  Chat: DurableObjectNamespace<ChatAgentDO>;
  ACCOUNT_DELETION: Workflow<AccountDeletionParams>;
  ENABLE_TEST_AUTH?: string;
  GOOGLE_BASE_URL?: string;
  EMAIL_FROM: string;
  PUBLIC_URL?: string;
  X_CLIENT_ID: string;
  X_CLIENT_SECRET: string;
}
