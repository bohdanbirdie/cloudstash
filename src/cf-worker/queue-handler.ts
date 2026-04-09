import { Effect, Schema } from "effect";

import type { LinkQueueMessage } from "./link-processor/types";
import { safeErrorInfo } from "./log-utils";

/**
 * Queue consumer config — must match wrangler.toml [[queues.consumers]]:
 *   queue = "cloudstash-link-queue"
 *   max_batch_size = 5          (messages per batch, matches DO concurrency)
 *   max_concurrency = 1         (one worker instance consuming at a time)
 *   max_retries = 3
 *   dead_letter_queue = "cloudstash-link-dlq"
 */
const BATCH_CONCURRENCY = 5;

class QueueProcessError extends Schema.TaggedError<QueueProcessError>()(
  "QueueProcessError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "Queue message processing failed",
    }),
    cause: Schema.Unknown,
  }
) {}

interface QueueEnv {
  LINK_PROCESSOR_DO: {
    idFromName(name: string): unknown;
    get(id: unknown): {
      ingestAndProcess(
        msg: LinkQueueMessage
      ): Promise<{ status: string; linkId?: string }>;
    };
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

        yield* Effect.logInfo("Queue message processed").pipe(
          Effect.annotateLogs({ linkId: result.linkId, status: result.status })
        );
        msg.ack();
      }).pipe(
        Effect.catchTag("QueueProcessError", (error) =>
          Effect.logError("Queue message failed").pipe(
            Effect.annotateLogs({
              storeId: msg.body.storeId,
              url: msg.body.url,
              attempt: msg.attempts,
              ...safeErrorInfo(error),
            }),
            Effect.tap(() => Effect.sync(() => msg.retry()))
          )
        ),
        Effect.withSpan("Queue.processMessage", {
          attributes: { storeId: msg.body.storeId, url: msg.body.url },
        })
      ),
    { concurrency: BATCH_CONCURRENCY, discard: true }
  ).pipe(Effect.runPromise);
}
