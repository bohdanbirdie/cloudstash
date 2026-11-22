/// <reference types="@cloudflare/workers-types" />
import type { Auth } from "./auth";
import type { LinkQueueMessage } from "./link-processor/types";
import type { XReconcileMessage } from "./x-sync/reconcile-queue";

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
  X_RECONCILE_QUEUE: Queue<XReconcileMessage>;
}
