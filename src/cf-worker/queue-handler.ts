import { Cause, Effect, Schema } from "effect";

import { AppLayerLive } from "./auth/service";
import { OrgId } from "./db/branded";
import type { LinkQueueMessage } from "./link-processor/types";
import { safeErrorInfo } from "./log-utils";
import type { Env } from "./shared";

/**
 * Queue consumer config — must match wrangler.jsonc queues.consumers:
 *   cloudstash-link-queue: max_batch_size 5, max_concurrency 1, max_retries 5,
 *     dead_letter_queue "cloudstash-link-dlq"
 *   cloudstash-link-dlq: max_batch_size 5, max_concurrency 1, max_retries 100
 */
const BATCH_CONCURRENCY = 5;

const mainQueueRetryDelay = (attempts: number): number =>
  Math.min(30 * 2 ** (attempts - 1), 480);

const dlqRetryDelay = (attempts: number): number =>
  attempts <= 24 ? 3600 : 14400;

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

export class QueueProcessError extends Schema.TaggedErrorClass<QueueProcessError>()(
  "QueueProcessError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(
        Effect.succeed("Queue message processing failed")
      )
    ),
    cause: Schema.Defect(),
  }
) {}

export class QueueDecodeError extends Schema.TaggedErrorClass<QueueDecodeError>()(
  "QueueDecodeError",
  {
    message: Schema.String.pipe(
      Schema.withConstructorDefault(
        Effect.succeed("Queue message failed to decode")
      )
    ),
    cause: Schema.Defect(),
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
const processMessage = (
  msg: Message<LinkQueueMessage>,
  linkProcessor: LinkProcessorBinding,
  retryDelaySeconds: (attempts: number) => number
) =>
  Effect.gen(function* () {
    const body = yield* Schema.decodeUnknownEffect(LinkQueueMessageSchema)(
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
      QueueProcessError: (error) => {
        const delaySeconds = retryDelaySeconds(msg.attempts);
        return Effect.logError("Queue message failed").pipe(
          Effect.annotateLogs({
            storeId: msg.body.storeId,
            url: msg.body.url,
            attempt: msg.attempts,
            retryDelaySeconds: delaySeconds,
            ...safeErrorInfo(error),
          }),
          Effect.tap(() => Effect.sync(() => msg.retry({ delaySeconds })))
        );
      },
      QueueDecodeError: (error) =>
        // Decode failure is not transient — ack to drop, don't retry.
        Effect.logError("Queue message rejected (decode)").pipe(
          Effect.annotateLogs({
            attempt: msg.attempts,
            ...safeErrorInfo(error),
          }),
          Effect.tap(() => Effect.sync(() => msg.ack()))
        ),
    }),
    Effect.withSpan("Queue.processMessage", {
      attributes: { attempt: msg.attempts },
    })
  );

export const handleQueueBatchEffect = (
  batch: MessageBatch<LinkQueueMessage>,
  linkProcessor: LinkProcessorBinding
) =>
  Effect.forEach(
    batch.messages,
    (msg) => processMessage(msg, linkProcessor, mainQueueRetryDelay),
    { concurrency: BATCH_CONCURRENCY, discard: true }
  );

export const handleDlqBatchEffect = (
  batch: MessageBatch<LinkQueueMessage>,
  linkProcessor: LinkProcessorBinding
) =>
  Effect.forEach(
    batch.messages,
    (msg) =>
      Effect.gen(function* () {
        const body = msg.body as Partial<LinkQueueMessage> | null | undefined;
        yield* Effect.logError("Dead-letter queue re-drive").pipe(
          Effect.annotateLogs({
            storeId: body?.storeId,
            url: body?.url,
            attempt: msg.attempts,
          })
        );
        yield* processMessage(msg, linkProcessor, dlqRetryDelay);
      }),
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
      Effect.tapCause((cause) =>
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

export const handleDlqBatch = (
  batch: MessageBatch<LinkQueueMessage>,
  env: Env
): Promise<void> =>
  Effect.runPromise(
    handleDlqBatchEffect(batch, env.LINK_PROCESSOR_DO).pipe(
      Effect.tapCause((cause) =>
        Effect.logError("DLQ batch failed").pipe(
          Effect.annotateLogs({
            batchSize: batch.messages.length,
            cause: Cause.pretty(cause),
          })
        )
      ),
      Effect.withSpan("Queue.handleDlqBatch", {
        attributes: { batchSize: batch.messages.length },
      }),
      Effect.provide(AppLayerLive(env))
    )
  );
