import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { agentHooks } from "../../chat-agent/hooks";
import type { ChatSession } from "../../chat-agent/sessions";
import { getUsageKey } from "../../chat-agent/usage";
import { signupUser } from "./helpers";

const sessionsUrl = (workspaceId: string) =>
  `http://worker/api/chat/sessions?workspaceId=${workspaceId}`;

const enableChat = (workspaceId: string) =>
  env.DB.prepare(
    "UPDATE organization SET tier = 'pro', tier_source = 'admin', usage_cycle_anchor = ? WHERE id = ?"
  )
    .bind(Date.now(), workspaceId)
    .run();

describe("chat sessions", () => {
  it("preloads metadata without materializing LiveStore and manages isolated chats", async () => {
    const user = await signupUser(
      `chat-sessions-${crypto.randomUUID()}@example.com`,
      "Chat sessions"
    );
    await enableChat(user.orgId);
    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(user.orgId)
    );

    const initialResponse = await SELF.fetch(sessionsUrl(user.orgId), {
      headers: { Cookie: user.cookie },
    });
    expect(initialResponse.status).toBe(200);
    const initial = await initialResponse.json<{
      sessions: readonly ChatSession[];
      assistantCredits: {
        limit: number;
        remaining: number;
        resetsAt: string;
      };
    }>();
    expect(initial.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentName: user.orgId,
          title: "New chat",
        }),
      ])
    );
    expect(initial.assistantCredits).toMatchObject({
      limit: 1_000,
      remaining: 1_000,
    });
    expect(
      await runInDurableObject(processor, (_instance, state) =>
        state.storage.get("sessionId")
      )
    ).toBeUndefined();

    const createdResponse = await SELF.fetch(sessionsUrl(user.orgId), {
      method: "POST",
      headers: { Cookie: user.cookie },
    });
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json<{
      sessions: readonly ChatSession[];
    }>();
    expect(created.sessions).toHaveLength(2);
    const newSession = created.sessions[0]!;
    expect(newSession.agentName).not.toBe(user.orgId);
    expect(await processor.hasChatSession(newSession.agentName)).toBe(true);
    const agentRequest = new Request(
      `http://worker/agents/chat/${newSession.agentName}?workspaceId=${user.orgId}`,
      { headers: { Cookie: user.cookie } }
    );
    expect(
      await agentHooks.onBeforeConnect(
        agentRequest,
        { className: "Chat", name: newSession.agentName },
        env
      )
    ).toBeUndefined();
    const unknownResponse = await agentHooks.onBeforeConnect(
      agentRequest,
      { className: "Chat", name: crypto.randomUUID() },
      env
    );
    expect(unknownResponse?.status).toBe(404);

    await processor.touchChatSession(
      newSession.agentName,
      "Find the city guides I saved for Lisbon"
    );
    expect(await processor.listChatSessions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentName: newSession.agentName,
          title: "Find the city guides I saved for Lisbon",
        }),
      ])
    );

    const deletedResponse = await SELF.fetch(
      `http://worker/api/chat/sessions/${newSession.agentName}?workspaceId=${user.orgId}`,
      { method: "DELETE", headers: { Cookie: user.cookie } }
    );
    expect(deletedResponse.status).toBe(200);
    expect(await processor.hasChatSession(newSession.agentName)).toBe(false);

    const lastDelete = await SELF.fetch(
      `http://worker/api/chat/sessions/${user.orgId}?workspaceId=${user.orgId}`,
      { method: "DELETE", headers: { Cookie: user.cookie } }
    );
    expect(lastDelete.status).toBe(200);
    expect(await processor.listChatSessions()).toEqual([]);

    const replacementResponse = await SELF.fetch(sessionsUrl(user.orgId), {
      method: "POST",
      headers: { Cookie: user.cookie },
    });
    expect(replacementResponse.status).toBe(201);
    const replacement = await replacementResponse.json<{
      sessions: readonly ChatSession[];
    }>();
    expect(replacement.sessions).toHaveLength(1);
    expect(replacement.sessions[0]?.agentName).not.toBe(user.orgId);
  });

  it("keeps one idempotent monthly spend ledger across conversations", async () => {
    const user = await signupUser(
      `chat-budget-${crypto.randomUUID()}@example.com`,
      "Chat budget"
    );
    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(user.orgId)
    );

    const settlements = await Promise.all([
      processor.settleChatSpend("2026-08", "turn-1", 100),
      processor.settleChatSpend("2026-08", "turn-1", 100),
    ]);
    expect(settlements.filter(Boolean)).toHaveLength(1);

    await processor.settleChatSpend("2026-08", "turn-2", 60);
    expect(await processor.getChatUsage("2026-08")).toEqual({
      spentMicroUsd: 160,
    });
    expect(await processor.canSpendChatUsage("2026-08", 160)).toBe(false);
  });

  it("does not infer monetary spend from the original token ledger", async () => {
    const user = await signupUser(
      `chat-usage-migration-${crypto.randomUUID()}@example.com`,
      "Chat usage migration"
    );
    const legacyChat = env.Chat.get(env.Chat.idFromName(user.orgId));
    const period = "legacy-calendar-month";
    const legacyTokenUsage = {
      promptTokens: 70,
      completionTokens: 30,
      reservedTokens: 0,
    };
    await runInDurableObject(legacyChat, (_instance, state) =>
      state.storage.put(getUsageKey(period), legacyTokenUsage)
    );

    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(user.orgId)
    );
    await processor.createChatSession();

    expect(await processor.getChatUsage(period)).toBeUndefined();
  });

  it("does not expose one library's registry to another session", async () => {
    const [owner, outsider] = await Promise.all([
      signupUser(`chat-owner-${crypto.randomUUID()}@example.com`, "Chat owner"),
      signupUser(
        `chat-outsider-${crypto.randomUUID()}@example.com`,
        "Chat outsider"
      ),
    ]);
    await enableChat(owner.orgId);

    const response = await SELF.fetch(sessionsUrl(owner.orgId), {
      headers: { Cookie: outsider.cookie },
    });
    expect(response.status).toBe(403);
  });
});
