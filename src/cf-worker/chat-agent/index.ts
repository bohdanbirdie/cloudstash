import { createGroq } from "@ai-sdk/groq";
import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  createStoreDoPromise,
  type ClientDoWithRpcCallback,
} from "@livestore/adapter-cloudflare";
import { nanoid, type Store } from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
} from "ai";
import { Data, Effect } from "effect";

import { schema } from "../../livestore/schema";
import { type Env } from "../shared";
import { createTools } from "./tools";

class ToolCallError extends Data.TaggedError("ToolCallError")<{
  message: string;
}> {}

class StreamError extends Data.TaggedError("StreamError")<{
  message: string;
}> {}

const SYSTEM_PROMPT = `You are a helpful assistant for managing links and bookmarks.

You have access to these tools:
- listRecentLinks: List recently saved links
- saveLink: Save a new URL to the workspace
- searchLinks: Search links by keyword

IMPORTANT INSTRUCTIONS:
1. When the user asks about their links, searches, or wants to save a URL, you MUST use the appropriate tool
2. NEVER output raw JSON or function call syntax in your response
3. After using a tool, summarize the results in natural language

Do NOT use tools for greetings or general questions unrelated to links.`;

export class ChatAgentDO
  extends AIChatAgent<Env>
  implements ClientDoWithRpcCallback
{
  __DURABLE_OBJECT_BRAND = "chat-agent-do" as never;
  private cachedStore: Store<typeof schema> | undefined;

  private async getSessionId(): Promise<string> {
    const key = "chat-session-id";
    const stored = await this.ctx.storage.get<string>(key);
    if (stored) return stored;

    const newSessionId = `chat-${this.name}-${nanoid()}`;
    await this.ctx.storage.put(key, newSessionId);
    return newSessionId;
  }

  private async getStore(): Promise<Store<typeof schema>> {
    if (this.cachedStore) return this.cachedStore;

    const sessionId = await this.getSessionId();
    this.cachedStore = await createStoreDoPromise({
      clientId: "chat-agent-do",
      durableObject: {
        bindingName: "Chat",
        ctx: this.ctx,
        env: this.env,
      } as never,
      livePull: true,
      schema,
      sessionId,
      storeId: this.name, // workspaceId
      syncBackendStub: this.env.SYNC_BACKEND_DO.get(
        this.env.SYNC_BACKEND_DO.idFromName(this.name)
      ) as never,
    });

    return this.cachedStore;
  }

  async syncUpdateRpc(payload: unknown): Promise<void> {
    if (!this.cachedStore) await this.getStore();
    await handleSyncUpdateRpc(payload);
  }

  async onChatMessage() {
    const groq = createGroq({ apiKey: this.env.GROQ_API_KEY });
    const model = groq("llama-3.3-70b-versatile");

    const store = await this.getStore();
    const tools = createTools(store);

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const program = Effect.gen(this, function* () {
          const messages = yield* Effect.promise(() =>
            convertToModelMessages(this.messages)
          );

          const result = yield* Effect.try({
            try: () =>
              streamText({
                model,
                system: `${SYSTEM_PROMPT}\n\nCurrent workspace: ${this.name}`,
                messages,
                tools,
                stopWhen: stepCountIs(5),
              }),
            catch: (error) => {
              const msg =
                error instanceof Error ? error.message : String(error);
              if (
                msg.includes("tool_use_failed") ||
                msg.includes("tool_calls")
              ) {
                return new ToolCallError({ message: msg });
              }
              return new StreamError({ message: msg });
            },
          });

          writer.merge(result.toUIMessageStream());
        });

        await program.pipe(
          Effect.catchTag("ToolCallError", () =>
            Effect.sync(() =>
              writer.write({
                type: "error",
                errorText:
                  "I had trouble processing that request. Could you try rephrasing?",
              })
            )
          ),
          Effect.catchTag("StreamError", (e) =>
            Effect.sync(() =>
              writer.write({
                type: "error",
                errorText: `Something went wrong: ${e.message}`,
              })
            )
          ),
          Effect.runPromise
        );
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
