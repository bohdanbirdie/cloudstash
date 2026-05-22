import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect, vi } from "vitest";

import { OrgId } from "../../db/branded";
import type { LinkQueueMessage } from "../../link-processor/types";
import { handleQueueBatchEffect } from "../../queue-handler";
import type { LinkProcessorBinding } from "../../queue-handler";

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

const makeProcessor = (
  rpcResult: { status: string; linkId?: string } | Error = {
    status: "ingested",
    linkId: "link-1",
  }
) => {
  const ingestAndProcess =
    rpcResult instanceof Error
      ? vi.fn().mockRejectedValue(rpcResult)
      : vi.fn().mockResolvedValue(rpcResult);
  const stub = { ingestAndProcess };
  const binding: LinkProcessorBinding = {
    idFromName: vi.fn().mockReturnValue("do-id"),
    get: vi.fn().mockReturnValue(stub),
  };
  return { binding, stub, ingestAndProcess };
};

const testMessage: LinkQueueMessage = {
  url: "https://example.com",
  storeId: OrgId.make("org-1"),
  source: "api",
  sourceMeta: null,
};

const runBatch = (
  messages: ReturnType<typeof createMessage>[],
  binding: LinkProcessorBinding
) =>
  handleQueueBatchEffect(
    {
      messages,
      queue: "cloudstash-link-queue",
    } as unknown as MessageBatch<LinkQueueMessage>,
    binding
  );

describe("handleQueueBatchEffect", () => {
  it.effect("acks message on successful ingest", () => {
    const msg = createMessage(testMessage);
    const { binding } = makeProcessor();

    return runBatch([msg], binding).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(msg.ack).toHaveBeenCalledOnce();
          expect(msg.retry).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("acks message on duplicate (not an error)", () => {
    const msg = createMessage(testMessage);
    const { binding } = makeProcessor({
      status: "duplicate",
      linkId: "existing-1",
    });

    return runBatch([msg], binding).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(msg.ack).toHaveBeenCalledOnce();
          expect(msg.retry).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("retries message when DO throws", () => {
    const msg = createMessage(testMessage, { attempts: 1 });
    const { binding } = makeProcessor(new Error("DO unavailable"));

    return runBatch([msg], binding).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(msg.retry).toHaveBeenCalledOnce();
          expect(msg.ack).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("routes to correct DO based on storeId", () => {
    const msg = createMessage({
      ...testMessage,
      storeId: OrgId.make("org-42"),
    });
    const { binding } = makeProcessor();
    const idFromName = binding.idFromName;
    const get = binding.get;

    return runBatch([msg], binding).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(idFromName).toHaveBeenCalledWith("org-42");
          expect(get).toHaveBeenCalledWith("do-id");
        })
      )
    );
  });

  it.effect("passes full message body to ingestAndProcess", () => {
    const body: LinkQueueMessage = {
      url: "https://test.com",
      storeId: OrgId.make("org-1"),
      source: "telegram",
      sourceMeta: JSON.stringify({ chatId: 123 }),
    };
    const msg = createMessage(body);
    const { binding, ingestAndProcess } = makeProcessor();

    return runBatch([msg], binding).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(ingestAndProcess).toHaveBeenCalledWith(body);
        })
      )
    );
  });

  it.effect("processes multiple messages independently", () => {
    const msg1 = createMessage(testMessage);
    const msg2 = createMessage({ ...testMessage, url: "https://other.com" });

    const ingestAndProcess = vi
      .fn()
      .mockResolvedValueOnce({ status: "ingested", linkId: "link-1" })
      .mockRejectedValueOnce(new Error("fail"));

    const binding: LinkProcessorBinding = {
      idFromName: vi.fn().mockReturnValue("do-id"),
      get: vi.fn().mockReturnValue({ ingestAndProcess }),
    };

    return runBatch([msg1, msg2], binding).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(msg1.ack).toHaveBeenCalledOnce();
          expect(msg2.retry).toHaveBeenCalledOnce();
        })
      )
    );
  });
});
