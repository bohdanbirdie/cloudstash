import { it } from "@effect/vitest";
import { Effect } from "effect";
import { describe, expect, vi } from "vitest";

import { OrgId } from "../../db/branded";
import type { LinkQueueMessage } from "../../link-processor/types";
import {
  handleDlqBatchEffect,
  handleQueueBatchEffect,
} from "../../queue-handler";
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

const runDlqBatch = (
  messages: ReturnType<typeof createMessage>[],
  binding: LinkProcessorBinding
) =>
  handleDlqBatchEffect(
    {
      messages,
      queue: "cloudstash-link-dlq",
    } as unknown as MessageBatch<LinkQueueMessage>,
    binding
  );

describe("handleQueueBatchEffect", () => {
  it.effect("acks a deletion no-op returned by the owner DO", () => {
    const msg = createMessage(testMessage);
    const { binding, ingestAndProcess } = makeProcessor({
      status: "dropped-retired",
    });
    return runBatch([msg], binding).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(msg.ack).toHaveBeenCalledOnce();
          expect(msg.retry).not.toHaveBeenCalled();
          expect(ingestAndProcess).toHaveBeenCalledOnce();
        })
      )
    );
  });

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

  it.effect("retries with exponential backoff delay", () => {
    const first = createMessage(testMessage, { attempts: 1 });
    const third = createMessage(testMessage, { attempts: 3 });
    const atCap = createMessage(testMessage, { attempts: 5 });
    const beyondCap = createMessage(testMessage, { attempts: 6 });
    const { binding } = makeProcessor(new Error("DO unavailable"));

    return runBatch([first, third, atCap, beyondCap], binding).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
          expect(third.retry).toHaveBeenCalledWith({ delaySeconds: 120 });
          expect(atCap.retry).toHaveBeenCalledWith({ delaySeconds: 480 });
          expect(beyondCap.retry).toHaveBeenCalledWith({ delaySeconds: 480 });
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

describe("handleDlqBatchEffect", () => {
  it.effect("acks message on successful re-drive", () => {
    const msg = createMessage(testMessage);
    const { binding } = makeProcessor();

    return runDlqBatch([msg], binding).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(msg.ack).toHaveBeenCalledOnce();
          expect(msg.retry).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("retries hourly through attempt 24, then every 4h", () => {
    const midDay = createMessage(testMessage, { attempts: 5 });
    const lastHourly = createMessage(testMessage, { attempts: 24 });
    const firstSlow = createMessage(testMessage, { attempts: 25 });
    const later = createMessage(testMessage, { attempts: 30 });
    const { binding } = makeProcessor(new Error("DO unavailable"));

    return runDlqBatch([midDay, lastHourly, firstSlow, later], binding).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(midDay.retry).toHaveBeenCalledWith({ delaySeconds: 3600 });
          expect(lastHourly.retry).toHaveBeenCalledWith({ delaySeconds: 3600 });
          expect(firstSlow.retry).toHaveBeenCalledWith({ delaySeconds: 14400 });
          expect(later.retry).toHaveBeenCalledWith({ delaySeconds: 14400 });
          expect(midDay.ack).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("acks malformed body instead of throwing", () => {
    const msg = createMessage(null as unknown as LinkQueueMessage);
    const { binding, ingestAndProcess } = makeProcessor();

    return runDlqBatch([msg], binding).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          expect(msg.ack).toHaveBeenCalledOnce();
          expect(msg.retry).not.toHaveBeenCalled();
          expect(ingestAndProcess).not.toHaveBeenCalled();
        })
      )
    );
  });
});
