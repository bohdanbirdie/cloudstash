import { Data, Effect } from "effect";

import type { LinkQueueMessage } from "./link-processor/types";
import { safeErrorInfo } from "./log-utils";

class QueueProcessError extends Data.TaggedError("QueueProcessError")<{
  cause: unknown;
}> {}

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

        yield* Effect.logInfo("Queue message processed").pipe(
          Effect.annotateLogs({ linkId: result.linkId, status: result.status })
        );
        msg.ack();
      }).pipe(
        Effect.catchAll((error) =>
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
        Effect.withSpan("Queue.processMessage")
      ),
    { concurrency: 1, discard: true }
  ).pipe(Effect.runPromise);
}
