import { createCerebras } from "@ai-sdk/cerebras";
import { AIChatAgent } from "@cloudflare/ai-chat";
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
} from "ai";

import { type Env } from "../shared";
import { createTools } from "./tools";

const SYSTEM_PROMPT = `You are a helpful assistant for managing links and bookmarks.

IMPORTANT: Only use tools when the user EXPLICITLY asks to:
- List/show their links (use listRecentLinks)
- Save/add a URL (use saveLink)
- Search/find links (use searchLinks)

Do NOT use tools for:
- Greetings ("hello", "hi")
- General questions ("can you code?", "what can you do?")
- Anything not directly about managing links`;

export class ChatAgentDO extends AIChatAgent<Env> {
  async onChatMessage() {
    const cerebras = createCerebras({ apiKey: this.env.CEREBRAS_API_KEY });
    const model = cerebras("llama-3.3-70b");
    const tools = createTools();

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const result = streamText({
          model,
          system: `${SYSTEM_PROMPT}\n\nCurrent workspace: ${this.name}`,
          messages: await convertToModelMessages(this.messages),
          tools,
          stopWhen: stepCountIs(5),
        });

        writer.merge(result.toUIMessageStream());
      },
    });

    return createUIMessageStreamResponse({ stream });
  }
}
