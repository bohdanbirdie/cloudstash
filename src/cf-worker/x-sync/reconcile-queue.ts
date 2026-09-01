import { Context, Effect, Layer, Result, Schema } from "effect";

import { OrgId, UserId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import { XSyncControl } from "./services/x-sync-control";

export const XReconcileMessage = Schema.Struct({
  userId: UserId,
  orgId: OrgId,
  wakeForEntitlementChange: Schema.optionalKey(Schema.Boolean),
});
export type XReconcileMessage = typeof XReconcileMessage.Type;

export class XReconcileQueueError extends Schema.TaggedErrorClass<XReconcileQueueError>()(
  "XReconcileQueueError",
  {
    message: Schema.String,
    userId: UserId,
    orgId: OrgId,
    cause: Schema.Defect(),
  }
) {}

const makeXReconcileQueue = (
  queue: Pick<Queue<XReconcileMessage>, "send">
) => ({
  send: Effect.fn("XReconcileQueue.send")(function* (
    message: XReconcileMessage
  ) {
    yield* Effect.tryPromise({
      try: () => queue.send(message),
      catch: (cause) =>
        new XReconcileQueueError({
          message: "Failed to enqueue X reconciliation",
          userId: message.userId,
          orgId: message.orgId,
          cause,
        }),
    });
  }),
});

export class XReconcileQueue extends Context.Service<
  XReconcileQueue,
  ReturnType<typeof makeXReconcileQueue>
>()("@cloudstash/x-sync/XReconcileQueue") {
  static layer(
    queue: Pick<Queue<XReconcileMessage>, "send">
  ): Layer.Layer<XReconcileQueue> {
    return Layer.succeed(XReconcileQueue, makeXReconcileQueue(queue));
  }
}

const retryDelay = (attempts: number): number =>
  Math.min(30 * 2 ** (attempts - 1), 480);

const processMessage = Effect.fn("XReconcileQueue.processMessage")(function* (
  message: Message
) {
  yield* Effect.annotateCurrentSpan("attempt", message.attempts);
  const decoded = yield* Schema.decodeUnknownEffect(XReconcileMessage)(
    message.body
  ).pipe(Effect.result);
  if (Result.isFailure(decoded)) {
    yield* Effect.annotateCurrentSpan("outcome", "rejected");
    yield* Effect.logWarning("X reconciliation message rejected").pipe(
      Effect.annotateLogs({
        attempt: message.attempts,
        ...safeErrorInfo(decoded.failure),
      })
    );
    message.ack();
    return;
  }

  const body = decoded.success;
  yield* Effect.annotateCurrentSpan({
    userId: maskId(body.userId),
    orgId: maskId(body.orgId),
  });
  const xSync = yield* XSyncControl;
  const reconciled = yield* xSync
    .reconcile(body.userId, body.orgId, body.wakeForEntitlementChange ?? false)
    .pipe(Effect.result);
  if (Result.isFailure(reconciled)) {
    const delaySeconds = retryDelay(message.attempts);
    yield* Effect.annotateCurrentSpan("outcome", "retry");
    yield* Effect.logWarning("X reconciliation message failed").pipe(
      Effect.annotateLogs({
        userId: maskId(body.userId),
        orgId: maskId(body.orgId),
        attempt: message.attempts,
        retryDelaySeconds: delaySeconds,
        ...safeErrorInfo(reconciled.failure),
      })
    );
    message.retry({ delaySeconds });
    return;
  }

  yield* Effect.annotateCurrentSpan("outcome", "succeeded");
  message.ack();
});

export const handleXReconcileBatchEffect = Effect.fn(
  "XReconcileQueue.handleBatch"
)(function* (batch: MessageBatch) {
  yield* Effect.annotateCurrentSpan("batchSize", batch.messages.length);
  yield* Effect.forEach(batch.messages, processMessage, {
    concurrency: 5,
    discard: true,
  });
});
