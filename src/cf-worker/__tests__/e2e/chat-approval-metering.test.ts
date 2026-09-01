import type { UIMessage } from "ai";
import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAssistantUsageWindow } from "../../billing/usage-cycle";
import {
  installTestChatModelProvider,
  installTestMetadataFetcher,
  quiesceLinkProcessor,
  signupUser,
} from "./helpers";

type LinkProcessorStub = ReturnType<(typeof env.LINK_PROCESSOR_DO)["get"]>;
let linkProcessor: LinkProcessorStub | undefined;

const openRouterStream = (cost: number, text: string) =>
  new Response(
    [
      `data: ${JSON.stringify({
        id: "response-1",
        model: "openai/gpt-5.1-chat",
        provider: "test",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: text },
            finish_reason: null,
          },
        ],
      })}\n\n`,
      `data: ${JSON.stringify({
        id: "response-1",
        model: "openai/gpt-5.1-chat",
        provider: "test",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
          cost,
        },
      })}\n\n`,
      "data: [DONE]\n\n",
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } }
  );

afterEach(async () => {
  if (linkProcessor) await quiesceLinkProcessor(linkProcessor);
  linkProcessor = undefined;
});

describe("chat approval metering", () => {
  it("checks allowance and settles spend for an approved destructive-tool continuation", async () => {
    const anchor = new Date(Date.now() - 60_000);
    const providerResponses = [
      { cost: 0.000_125, text: "Ordinary answer." },
      { cost: 0.000_375, text: "Deleted." },
    ];
    const url = `https://example.com/approved-delete-${crypto.randomUUID()}`;
    const providerFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      if (
        request.url.startsWith("https://openrouter.ai/api/v1/chat/completions")
      ) {
        const response = providerResponses.shift();
        if (!response) throw new Error("Unexpected extra OpenRouter request");
        return openRouterStream(response.cost, response.text);
      }
      throw new Error(`Unexpected outbound request: ${request.url}`);
    };

    const user = await signupUser(
      `chat-approval-metering-${crypto.randomUUID()}@example.com`,
      "Chat approval metering"
    );
    await env.DB.prepare(
      "UPDATE organization SET admin_tier_grant = 'pro', admin_tier_granted_at = ?, feature_overrides = ? WHERE id = ?"
    )
      .bind(anchor.getTime(), JSON.stringify({ aiSummary: false }), user.orgId)
      .run();

    linkProcessor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(user.orgId)
    );
    await installTestMetadataFetcher(linkProcessor);
    const saved = await linkProcessor.saveLink({ url, source: "api" });
    expect(saved.ok).toBe(true);
    if (!saved.ok) throw new Error(saved.error.message);

    const linkId = saved.value.link.id;
    const chat = env.Chat.get(env.Chat.idFromName(user.orgId));
    await installTestChatModelProvider(chat, providerFetch);
    const bodies = await runInDurableObject(chat, async (instance) => {
      instance.messages = [
        {
          id: "user-ordinary",
          role: "user",
          parts: [{ type: "text", text: "Show my recent links" }],
        },
      ];
      const ordinaryResponse = await instance.onChatMessage(() => undefined, {
        requestId: "ordinary-generation",
      });
      const ordinary = await ordinaryResponse?.text();

      instance.messages = [
        {
          id: "user-delete",
          role: "user",
          parts: [{ type: "text", text: "Delete the approved link" }],
        },
        {
          id: "assistant-delete",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "deleteLink",
              toolCallId: "delete-call",
              state: "approval-responded",
              input: { id: linkId },
              approval: { id: "delete-approval", approved: true },
            },
          ],
        },
      ] satisfies UIMessage[];
      const response = await instance.onChatMessage(() => undefined, {
        requestId: "approval-continuation",
        continuation: true,
      });
      return { continuation: await response?.text(), ordinary };
    });

    expect(bodies.ordinary).toContain("Ordinary answer.");
    expect(bodies.continuation).toContain("Deleted.");
    expect(providerResponses).toEqual([]);
    expect(await linkProcessor.getLink({ id: linkId })).toMatchObject({
      ok: true,
      value: { state: "archive" },
    });

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
    if (!usageWindow) throw new Error("Expected active Assistant usage window");
    await vi.waitFor(async () => {
      expect(await linkProcessor!.getChatUsage(usageWindow.id)).toEqual({
        spentMicroUsd: 500,
      });
    });
  });

  it("does not run a rejected destructive tool and still settles the continuation", async () => {
    const anchor = new Date(Date.now() - 60_000);
    const providerResponses = [{ cost: 0.000_2, text: "Kept the link." }];
    const url = `https://example.com/rejected-delete-${crypto.randomUUID()}`;
    const providerFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      if (
        request.url.startsWith("https://openrouter.ai/api/v1/chat/completions")
      ) {
        const response = providerResponses.shift();
        if (!response) throw new Error("Unexpected extra OpenRouter request");
        return openRouterStream(response.cost, response.text);
      }
      throw new Error(`Unexpected outbound request: ${request.url}`);
    };

    const user = await signupUser(
      `chat-rejected-approval-${crypto.randomUUID()}@example.com`,
      "Rejected chat approval"
    );
    await env.DB.prepare(
      "UPDATE organization SET admin_tier_grant = 'pro', admin_tier_granted_at = ?, feature_overrides = ? WHERE id = ?"
    )
      .bind(anchor.getTime(), JSON.stringify({ aiSummary: false }), user.orgId)
      .run();

    linkProcessor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(user.orgId)
    );
    await installTestMetadataFetcher(linkProcessor);
    const saved = await linkProcessor.saveLink({ url, source: "api" });
    if (!saved.ok) throw new Error(saved.error.message);
    const linkId = saved.value.link.id;
    const chat = env.Chat.get(env.Chat.idFromName(user.orgId));
    await installTestChatModelProvider(chat, providerFetch);

    const body = await runInDurableObject(chat, async (instance) => {
      instance.messages = [
        {
          id: "user-rejected-delete",
          role: "user",
          parts: [{ type: "text", text: "Delete this link" }],
        },
        {
          id: "assistant-rejected-delete",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "deleteLink",
              toolCallId: "rejected-delete-call",
              state: "approval-responded",
              input: { id: linkId },
              approval: { id: "rejected-delete-approval", approved: false },
            },
          ],
        },
      ] satisfies UIMessage[];
      const response = await instance.onChatMessage(() => undefined, {
        requestId: "rejected-approval-continuation",
        continuation: true,
      });
      return response?.text();
    });

    expect(body).toContain("Kept the link.");
    expect(providerResponses).toEqual([]);
    expect(await linkProcessor.getLink({ id: linkId })).toMatchObject({
      ok: true,
      value: { state: "inbox" },
    });

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
    if (!usageWindow) throw new Error("Expected active Assistant usage window");
    await vi.waitFor(async () => {
      expect(await linkProcessor!.getChatUsage(usageWindow.id)).toEqual({
        spentMicroUsd: 200,
      });
    });
  });
});
