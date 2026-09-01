import type { UIMessage } from "ai";
import { env, runInDurableObject } from "cloudflare:test";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAssistantUsageWindow } from "../../billing/usage-cycle";
import type { ChatContextSummary } from "../../chat-agent/compaction";
import { COMPACTION_STORAGE_KEY } from "../../chat-agent/compaction";
import {
  installTestChatModelProvider,
  quiesceLinkProcessor,
  signupUser,
} from "./helpers";

type LinkProcessorStub = ReturnType<(typeof env.LINK_PROCESSOR_DO)["get"]>;
let linkProcessor: LinkProcessorStub | undefined;

const completionResponse = (cost: number, text: string) =>
  Response.json({
    id: "compaction-response",
    model: "openai/gpt-5.6-luna-20260709",
    provider: "test",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      cost,
    },
  });

const streamResponse = (cost: number, text: string) =>
  new Response(
    [
      `data: ${JSON.stringify({
        id: "answer-response",
        model: "openai/gpt-5.6-luna-20260709",
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
        id: "answer-response",
        model: "openai/gpt-5.6-luna-20260709",
        provider: "test",
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 10,
          total_tokens: 60,
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

describe("chat context compaction", () => {
  it("persists a real compacted summary and settles compaction plus answer spend", async () => {
    const anchor = new Date(Date.now() - 60_000);
    const calls: string[] = [];
    const providerFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init);
      if (
        !request.url.startsWith("https://openrouter.ai/api/v1/chat/completions")
      ) {
        throw new Error(`Unexpected outbound request: ${request.url}`);
      }
      const body = (await request.json()) as { readonly stream?: boolean };
      calls.push(body.stream ? "answer" : "compaction");
      return body.stream
        ? streamResponse(0.000_375, "The compacted conversation still works.")
        : completionResponse(0.000_125, "The user is reviewing saved links.");
    };

    const user = await signupUser(
      `chat-compaction-${crypto.randomUUID()}@example.com`,
      "Chat compaction"
    );
    await env.DB.prepare(
      "UPDATE organization SET admin_tier_grant = 'pro', admin_tier_granted_at = ? WHERE id = ?"
    )
      .bind(anchor.getTime(), user.orgId)
      .run();
    linkProcessor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(user.orgId)
    );

    const chat = env.Chat.get(env.Chat.idFromName(user.orgId));
    await installTestChatModelProvider(chat, providerFetch);
    const result = await runInDurableObject(chat, async (instance, state) => {
      instance.messages = Array.from({ length: 20 }, (_, index) => ({
        id: `message-${index}`,
        role: index === 19 ? ("user" as const) : ("assistant" as const),
        parts: [
          {
            type: "text" as const,
            text:
              index === 19
                ? "Continue from our earlier discussion."
                : `${index}: ${"saved link context ".repeat(700)}`,
          },
        ],
      })) satisfies UIMessage[];
      const response = await instance.onChatMessage(() => undefined);
      const body = await response?.text();
      const summary = await state.storage.get<ChatContextSummary>(
        COMPACTION_STORAGE_KEY
      );
      return { body, summary };
    });

    expect(calls).toEqual(["compaction", "answer"]);
    expect(result.body).toContain("The compacted conversation still works.");
    expect(result.summary).toMatchObject({
      summary: "The user is reviewing saved links.",
      throughMessageId: "message-7",
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
});
