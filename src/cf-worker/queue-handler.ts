import { Data, Effect } from "effect";

import type { LinkQueueMessage } from "./link-processor/types";
import { safeErrorInfo } from "./log-utils";
import { logSync } from "./logger";

class QueueProcessError extends Data.TaggedError("QueueProcessError")<{
  cause: unknown;
}> {}

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
  await Effect.forEach(
    batch.messages,
    (msg) =>
      Effect.gen(function* () {
        const { storeId } = msg.body;
        const doId = env.LINK_PROCESSOR_DO.idFromName(storeId);
        const stub = env.LINK_PROCESSOR_DO.get(doId);

        const result = yield* Effect.tryPromise({
          catch: (error) => new QueueProcessError({ cause: error }),
          try: () => stub.ingestAndProcess(msg.body),
        });

        logger.info("Queue message processed", {
          linkId: result.linkId,
          status: result.status,
        });
        msg.ack();
      }).pipe(
        Effect.catchAll((error) =>
          Effect.sync(() => {
            logger.error("Queue message failed", {
              storeId: msg.body.storeId,
              url: msg.body.url,
              attempt: msg.attempts,
              ...safeErrorInfo(error),
            });
            msg.retry();
          })
        ),
        Effect.withSpan("Queue.processMessage")
      ),
    { concurrency: 1, discard: true }
  ).pipe(Effect.runPromise);
}
