import { Schema } from "effect";

import {
  getUsageKey,
  getUsageSettlementKey,
  UsageData,
  UsageSettlement,
} from "./usage";
import type { UsageStorage } from "./usage-core";

export const CHAT_SESSION_LIMIT = 50;
export const CHAT_SESSION_REGISTRY_KEY = "chat:sessions:v1";

export const ChatSession = Schema.Struct({
  id: Schema.String,
  agentName: Schema.String,
  title: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export type ChatSession = typeof ChatSession.Type;
export const ChatSessionRegistry = Schema.Array(ChatSession);

export type ChatSessionRegistryResult =
  | { readonly ok: true; readonly sessions: readonly ChatSession[] }
  | {
      readonly ok: false;
      readonly code: "limit_reached" | "not_found";
    };

export async function retireRegisteredChatSession(
  agentName: string,
  operations: {
    readonly read: () => Promise<readonly ChatSession[]>;
    readonly retire: () => Promise<void>;
    readonly remove: () => Promise<ChatSessionRegistryResult>;
  }
): Promise<ChatSessionRegistryResult> {
  const sessions = await operations.read();
  if (!sessions.some((session) => session.agentName === agentName)) {
    return { ok: false, code: "not_found" };
  }
  await operations.retire();
  return operations.remove();
}

export function makeDefaultChatSession(
  workspaceId: string,
  now = new Date().toISOString()
): ChatSession {
  return {
    id: workspaceId,
    agentName: workspaceId,
    title: "New chat",
    createdAt: now,
    updatedAt: now,
  };
}

export function makeNewChatSession(
  now = new Date().toISOString()
): ChatSession {
  const id = crypto.randomUUID();
  return {
    id,
    agentName: id,
    title: "New chat",
    createdAt: now,
    updatedAt: now,
  };
}

export function titleFromMessage(message: string): string {
  const title = message.replace(/\s+/g, " ").trim();
  if (title.length <= 56) return title;
  return `${title.slice(0, 55).trimEnd()}…`;
}

export function chatUsageStorage(
  storage: Pick<DurableObjectStorage, "get" | "put">,
  period: string
): UsageStorage {
  const key = getUsageKey(period);
  return {
    getUsage: async () => {
      const stored = await storage.get(key);
      return stored === undefined
        ? undefined
        : Schema.decodeUnknownPromise(UsageData)(stored);
    },
    getSettlement: async (settlementId) => {
      const stored = await storage.get(
        getUsageSettlementKey(period, settlementId)
      );
      return stored === undefined
        ? undefined
        : Schema.decodeUnknownPromise(UsageSettlement)(stored);
    },
    putUsage: (data) => storage.put(key, data),
    putSettlement: (settlementId, data) =>
      storage.put(getUsageSettlementKey(period, settlementId), data),
  };
}
