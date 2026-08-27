import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { CHAT_DISABLED_MESSAGE } from "../../chat-agent/usage";
import { signupUser } from "./helpers";

describe("chat entitlement", () => {
  it("blocks a free workspace before reserving tokens or invoking the model", async () => {
    const user = await signupUser(
      `chat-disabled-${crypto.randomUUID()}@example.com`,
      "Free chat user"
    );
    const stub = env.Chat.get(env.Chat.idFromName(user.orgId));

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
  });
});
