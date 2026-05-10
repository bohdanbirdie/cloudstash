import { Cause, Effect, Schema } from "effect";

import { AppLayerLive } from "./auth/service";
import { OrgId } from "./db/branded";
import type { LinkQueueMessage } from "./link-processor/types";
import { safeErrorInfo } from "./log-utils";
import type { Env } from "./shared";

/**
 * Queue consumer config — must match wrangler.toml [[queues.consumers]]:
 *   queue = "cloudstash-link-queue"
 *   max_batch_size = 5          (messages per batch, matches DO concurrency)
 *   max_concurrency = 1         (one worker instance consuming at a time)
 *   max_retries = 3
 *   dead_letter_queue = "cloudstash-link-dlq"
 */
const BATCH_CONCURRENCY = 5;

/**
 * CF Queues serializes messages — branded fields on `LinkQueueMessage` are
 * structural-only on the wire. Decode at consume time so a malformed producer
 * surfaces here instead of silently propagating fake brands.
 */
const LinkQueueMessageSchema = Schema.Struct({
  url: Schema.String,
  storeId: OrgId,
  source: Schema.String,
  sourceMeta: Schema.NullOr(Schema.String),
});

export class QueueProcessError extends Schema.TaggedError<QueueProcessError>()(
  "QueueProcessError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "Queue message processing failed",
    }),
    cause: Schema.Defect,
  }
) {}

export class QueueDecodeError extends Schema.TaggedError<QueueDecodeError>()(
  "QueueDecodeError",
  {
    message: Schema.optionalWith(Schema.String, {
      default: () => "Queue message failed to decode",
    }),
    cause: Schema.Defect,
  }
) {}

export interface LinkProcessorStub {
  readonly ingestAndProcess: (msg: LinkQueueMessage) => Promise<{
    status: string;
    linkId?: string;
  }>;
}

export interface LinkProcessorBinding {
  readonly idFromName: (name: string) => DurableObjectId;
  readonly get: (
    id: DurableObjectId,
    options?: DurableObjectNamespaceGetDurableObjectOptions
  ) => LinkProcessorStub;
}

/**
 * Pure Effect queue handler. Messages dispatch to LinkProcessorDO; if that org
 * is being deleted, the in-DO tombstone catches the message before any work
 * happens — no need for a worker-side gate.
 */
export const handleQueueBatchEffect = (
  batch: MessageBatch<LinkQueueMessage>,
  linkProcessor: LinkProcessorBinding
) =>
  Effect.forEach(
    batch.messages,
    (msg) =>
      Effect.gen(function* () {
        const body = yield* Schema.decodeUnknown(LinkQueueMessageSchema)(
          msg.body
        ).pipe(Effect.mapError((cause) => new QueueDecodeError({ cause })));
        const { storeId } = body;
        yield* Effect.annotateCurrentSpan({
          storeId,
          attempt: msg.attempts,
        });

        const doId = linkProcessor.idFromName(storeId);
        const stub = linkProcessor.get(doId);

        const result = yield* Effect.tryPromise({
          catch: (error) => new QueueProcessError({ cause: error }),
          try: () => stub.ingestAndProcess(body),
        });

        yield* Effect.annotateCurrentSpan({
          linkId: result.linkId,
          status: result.status,
        });
        yield* Effect.logInfo("Queue message processed").pipe(
          Effect.annotateLogs({
            storeId,
            linkId: result.linkId,
            status: result.status,
          })
        );
        msg.ack();
      }).pipe(
        Effect.catchTags({
          QueueProcessError: (error) =>
            Effect.logError("Queue message failed").pipe(
              Effect.annotateLogs({
                storeId: msg.body.storeId,
                url: msg.body.url,
                attempt: msg.attempts,
                ...safeErrorInfo(error),
              }),
              Effect.zipLeft(Effect.sync(() => msg.retry()))
            ),
          QueueDecodeError: (error) =>
            // Decode failure is not transient — ack to drop, don't retry.
            Effect.logError("Queue message rejected (decode)").pipe(
              Effect.annotateLogs({
                attempt: msg.attempts,
                ...safeErrorInfo(error),
              }),
              Effect.zipLeft(Effect.sync(() => msg.ack()))
            ),
        }),
        Effect.withSpan("Queue.processMessage", {
          attributes: { attempt: msg.attempts },
        })
      ),
    { concurrency: BATCH_CONCURRENCY, discard: true }
  );

/**
 * Production entry point. Provides AppLayerLive (DbClient, AuthClient,
 * DeletionRuntime, OtelTracing); logs structured Cause on unexpected defects.
 */
export const handleQueueBatch = (
  batch: MessageBatch<LinkQueueMessage>,
  env: Env
): Promise<void> =>
  Effect.runPromise(
    handleQueueBatchEffect(batch, env.LINK_PROCESSOR_DO).pipe(
      Effect.tapErrorCause((cause) =>
        Effect.logError("Queue batch failed").pipe(
          Effect.annotateLogs({
            batchSize: batch.messages.length,
            cause: Cause.pretty(cause),
          })
        )
      ),
      Effect.withSpan("Queue.handleBatch", {
        attributes: { batchSize: batch.messages.length },
      }),
      Effect.provide(AppLayerLive(env))
    )
  );
