import type { ToolCallOptions } from "ai";
import { env, runInDurableObject } from "cloudflare:test";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { makeChatLibrary } from "../../chat-agent/library";
import { createTools } from "../../chat-agent/tools";
import {
  installTestMetadataFetcher,
  quiesceLinkProcessor,
  signupUser,
} from "./helpers";

const stubCtx = {} as ToolCallOptions;

type LinkProcessorStub = ReturnType<(typeof env.LINK_PROCESSOR_DO)["get"]>;
let linkProcessor: LinkProcessorStub | undefined;

afterEach(async () => {
  if (linkProcessor) await quiesceLinkProcessor(linkProcessor);
  linkProcessor = undefined;
});

describe("chat library RPC", () => {
  it("ignores late LiveStore callbacks without materializing a chat replica", async () => {
    const user = await signupUser(
      `chat-library-${crypto.randomUUID()}@example.com`,
      "Chat library user"
    );
    const chat = env.Chat.get(env.Chat.idFromName(user.orgId));

    await chat.syncUpdateRpc(new Uint8Array(), user.orgId);

    const sessionId = await runInDurableObject(chat, (_instance, state) =>
      state.storage.get("chat-session-id")
    );
    expect(sessionId).toBeUndefined();
  });

  it("runs chat tools through Effect RPC against the canonical library", async () => {
    const url = `https://example.com/chat-rpc-${crypto.randomUUID()}`;
    const user = await signupUser(
      `chat-rpc-${crypto.randomUUID()}@example.com`,
      "Chat RPC user"
    );
    const libraryId = env.LINK_PROCESSOR_DO.idFromName(user.orgId);
    linkProcessor = env.LINK_PROCESSOR_DO.get(libraryId);
    await installTestMetadataFetcher(linkProcessor);
    const library = makeChatLibrary({
      callRpc: (payload) =>
        linkProcessor!.workspaceLinksRpc(Uint8Array.from(payload)),
      durableObjectId: libraryId.toString(),
    });
    const tools = createTools(library, Effect.runPromise);

    const saved = await tools.saveLink.execute!({ url }, stubCtx);
    expect(saved).toMatchObject({ success: true });
    const linkId = "linkId" in saved ? saved.linkId : undefined;
    if (typeof linkId !== "string") throw new Error("Expected saved link ID");

    const listed = await tools.listRecentLinks.execute!({ limit: 5 }, stubCtx);
    expect(listed).toMatchObject({ links: [{ id: linkId, url }] });

    const searched = await tools.searchLinks.execute!(
      { query: "chat rpc" },
      stubCtx
    );
    expect(searched).toMatchObject({
      results: [{ id: linkId, url }],
      total: 1,
    });

    expect(await tools.getStats.execute!({}, stubCtx)).toEqual({
      completed: 0,
      inbox: 1,
      total: 1,
    });

    expect(
      await tools.completeLink.execute!({ id: linkId }, stubCtx)
    ).toMatchObject({ success: true });
    expect(tools.deleteLink.needsApproval).toBe(true);
    expect(
      await tools.deleteLink.execute!({ id: linkId }, stubCtx)
    ).toMatchObject({ success: true });
    expect(await tools.getLink.execute!({ id: linkId }, stubCtx)).toMatchObject(
      { link: { id: linkId, state: "archive" } }
    );
  });
});
