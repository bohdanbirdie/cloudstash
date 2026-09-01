import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { Context, Effect, Layer } from "effect";

import {
  OPENROUTER_MODEL_ID,
  openRouterChatSettings,
} from "../openrouter-model";

export interface ChatModels {
  readonly assistant: LanguageModel;
  readonly compaction: LanguageModel;
}

export class ChatModelProvider extends Context.Service<
  ChatModelProvider,
  {
    readonly models: (sessionId: string) => Effect.Effect<ChatModels>;
  }
>()("@cloudstash/chat-agent/ChatModelProvider") {}

export const makeChatModelProvider = (
  apiKey: string,
  fetcher: typeof fetch = fetch
): typeof ChatModelProvider.Service => {
  const openrouter = createOpenRouter({ apiKey, fetch: fetcher });
  return ChatModelProvider.of({
    models: Effect.fn("ChatModelProvider.models")((sessionId: string) =>
      Effect.succeed({
        assistant: openrouter(
          OPENROUTER_MODEL_ID,
          openRouterChatSettings(sessionId, "assistant")
        ),
        compaction: openrouter(
          OPENROUTER_MODEL_ID,
          openRouterChatSettings(sessionId, "compaction")
        ),
      })
    ),
  });
};

export const ChatModelProviderLive = (apiKey: string) =>
  Layer.succeed(ChatModelProvider, makeChatModelProvider(apiKey));
