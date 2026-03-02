import { type LinkQueueMessage } from "./link-processor/types";
import { safeErrorInfo } from "./log-utils";
import { logSync } from "./logger";

const logger = logSync("Queue");

interface LinkProcessorStub {
  ingestAndProcess(
    msg: LinkQueueMessage
  ): Promise<{ status: string; linkId?: string }>;
}

interface QueueEnv {
  LINK_PROCESSOR_DO: {
    idFromName(name: string): unknown;
    get(id: unknown): LinkProcessorStub;
  };
}

export async function handleQueueBatch(
  batch: MessageBatch<LinkQueueMessage>,
  env: QueueEnv
): Promise<void> {
  for (const msg of batch.messages) {
    const { storeId } = msg.body;
    const doId = env.LINK_PROCESSOR_DO.idFromName(storeId);
    const stub = env.LINK_PROCESSOR_DO.get(doId);

    try {
      const result = await stub.ingestAndProcess(msg.body);
      logger.info("Queue message processed", {
        linkId: result.linkId,
        status: result.status,
      });
      msg.ack();
    } catch (error: unknown) {
      logger.error("Queue message failed", {
        storeId,
        url: msg.body.url,
        attempt: msg.attempts,
        ...safeErrorInfo(error),
      });
      msg.retry();
    }
  }
}
