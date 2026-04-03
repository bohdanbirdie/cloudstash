import { describe, expect, it, vi } from "vitest";

import { OrgId } from "../../db/branded";
import type { LinkQueueMessage } from "../../link-processor/types";
import { handleQueueBatch } from "../../queue-handler";
import type { Env } from "../../shared";

function createMessage(
  body: LinkQueueMessage,
  overrides: { attempts?: number } = {}
) {
  return {
    body,
    attempts: overrides.attempts ?? 1,
    ack: vi.fn(),
    retry: vi.fn(),
    id: "msg-1",
    timestamp: new Date(),
  };
}

function createEnv(
  rpcResult: { status: string; linkId?: string } | Error = {
    status: "ingested",
    linkId: "link-1",
  }
) {
  const ingestAndProcess =
    rpcResult instanceof Error
      ? vi.fn().mockRejectedValue(rpcResult)
      : vi.fn().mockResolvedValue(rpcResult);

  const stub = { ingestAndProcess };
  const env = {
    LINK_PROCESSOR_DO: {
      idFromName: vi.fn().mockReturnValue("do-id"),
      get: vi.fn().mockReturnValue(stub),
    },
  };

  return { env, stub, ingestAndProcess };
}

const testMessage: LinkQueueMessage = {
  url: "https://example.com",
  storeId: OrgId.make("org-1"),
  source: "api",
  sourceMeta: null,
};

async function runQueueHandler(
  messages: ReturnType<typeof createMessage>[],
  env: ReturnType<typeof createEnv>["env"]
) {
  const batch = { messages, queue: "cloudstash-link-queue" };
  await handleQueueBatch(
    batch as unknown as MessageBatch<LinkQueueMessage>,
    env as unknown as Env
  );
}

describe("queue handler", () => {
  it("acks message on successful ingest", async () => {
    const msg = createMessage(testMessage);
    const { env } = createEnv({ status: "ingested", linkId: "link-1" });

    await runQueueHandler([msg], env);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("acks message on duplicate (not an error)", async () => {
    const msg = createMessage(testMessage);
    const { env } = createEnv({ status: "duplicate", linkId: "existing-1" });

    await runQueueHandler([msg], env);

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it("retries message when DO throws", async () => {
    const msg = createMessage(testMessage, { attempts: 1 });
    const { env } = createEnv(new Error("DO unavailable"));

    await runQueueHandler([msg], env);

    expect(msg.retry).toHaveBeenCalledOnce();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it("routes to correct DO based on storeId", async () => {
    const msg = createMessage({
      ...testMessage,
      storeId: OrgId.make("org-42"),
    });
    const { env } = createEnv({ status: "ingested", linkId: "link-1" });

    await runQueueHandler([msg], env);

    expect(env.LINK_PROCESSOR_DO.idFromName).toHaveBeenCalledWith("org-42");
    expect(env.LINK_PROCESSOR_DO.get).toHaveBeenCalledWith("do-id");
  });

  it("passes full message body to ingestAndProcess", async () => {
    const body: LinkQueueMessage = {
      url: "https://test.com",
      storeId: OrgId.make("org-1"),
      source: "telegram",
      sourceMeta: JSON.stringify({ chatId: 123 }),
    };
    const msg = createMessage(body);
    const { env, ingestAndProcess } = createEnv({
      status: "ingested",
      linkId: "link-1",
    });

    await runQueueHandler([msg], env);

    expect(ingestAndProcess).toHaveBeenCalledWith(body);
  });

  it("processes multiple messages independently", async () => {
    const msg1 = createMessage(testMessage);
    const msg2 = createMessage({ ...testMessage, url: "https://other.com" });

    const ingestAndProcess = vi
      .fn()
      .mockResolvedValueOnce({ status: "ingested", linkId: "link-1" })
      .mockRejectedValueOnce(new Error("fail"));

    const env = {
      LINK_PROCESSOR_DO: {
        idFromName: vi.fn().mockReturnValue("do-id"),
        get: vi.fn().mockReturnValue({ ingestAndProcess }),
      },
    };

    await runQueueHandler([msg1, msg2], env);

    expect(msg1.ack).toHaveBeenCalledOnce();
    expect(msg2.retry).toHaveBeenCalledOnce();
  });
});
