import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { resolveAssistantUsageWindow } from "../../billing/usage-cycle";
import {
  CHAT_DISABLED_MESSAGE,
  LIMIT_REACHED_MESSAGE,
  parseAiMeterLimit,
} from "../../chat-agent/usage";
import { installTestChatModelProvider, signupUser } from "./helpers";

describe("chat entitlement", () => {
  it("blocks a free workspace before reserving tokens or invoking the model", async () => {
    const user = await signupUser(
      `chat-disabled-${crypto.randomUUID()}@example.com`,
      "Free chat user"
    );
    const stub = env.Chat.get(env.Chat.idFromName(user.orgId));
    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(user.orgId)
    );

    const result = await runInDurableObject(stub, async (instance, state) => {
      const response = await instance.onChatMessage(() => undefined);
      const usage = await state.storage.list({ prefix: "usage:" });
      return {
        body: await response?.text(),
        status: response?.status,
        usageKeys: [...usage.keys()],
      };
    });

    expect(result.status).toBe(200);
    expect(result.body).toContain(CHAT_DISABLED_MESSAGE);
    expect(result.usageKeys).toEqual([]);
    expect(
      await runInDurableObject(processor, (_instance, state) =>
        state.storage.list({ prefix: "usage:" })
      )
    ).toEqual(new Map());
  });

  it("blocks a paid workspace at the exact private limit without invoking the model", async () => {
    const anchor = new Date(Date.now() - 60_000);
    const user = await signupUser(
      `chat-limit-${crypto.randomUUID()}@example.com`,
      "Chat limit"
    );
    await env.DB.prepare(
      "UPDATE organization SET tier = 'pro', tier_source = 'admin', usage_cycle_anchor = ? WHERE id = ?"
    )
      .bind(anchor.getTime(), user.orgId)
      .run();

    const usageWindow = resolveAssistantUsageWindow(
      {
        source: "admin",
        billingInterval: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        usageCycleAnchor: anchor,
      },
      new Date()
    );
    const limitMicroUsd = parseAiMeterLimit(
      (env as unknown as { readonly AI_METER_LIMIT?: string }).AI_METER_LIMIT
    );
    if (!usageWindow || limitMicroUsd === undefined) {
      throw new Error("Expected configured Assistant usage window");
    }

    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(user.orgId)
    );
    await processor.settleChatSpend(
      usageWindow.id,
      "exact-limit",
      limitMicroUsd
    );
    const chat = env.Chat.get(env.Chat.idFromName(user.orgId));
    let providerCalls = 0;
    await installTestChatModelProvider(chat, () => {
      providerCalls += 1;
      return Promise.reject(new Error("Model must not run at the usage limit"));
    });
    const body = await runInDurableObject(chat, async (instance) => {
      instance.messages = [
        {
          id: "user-at-limit",
          role: "user",
          parts: [{ type: "text", text: "Show my recent links" }],
        },
      ];
      const response = await instance.onChatMessage(() => undefined);
      return response?.text();
    });

    expect(body).toContain(LIMIT_REACHED_MESSAGE);
    expect(providerCalls).toBe(0);
    expect(await processor.getChatUsage(usageWindow.id)).toEqual({
      spentMicroUsd: limitMicroUsd,
    });
  });
});
