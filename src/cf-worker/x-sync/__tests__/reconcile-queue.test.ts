import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer, References } from "effect";

import { OrgId, UserId } from "../../db/branded";
import { XSyncSideEffectError } from "../errors";
import { handleXReconcileBatchEffect } from "../reconcile-queue";
import type { XReconcileMessage } from "../reconcile-queue";
import { XSyncControl } from "../services/x-sync-control";

const quiet = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(References.MinimumLogLevel, "None"));

const body: XReconcileMessage = {
  userId: UserId.make("user-1"),
  orgId: OrgId.make("org-1"),
};

const createMessage = (value: unknown, attempts = 1) => {
  const acknowledgements = { count: 0 };
  const retries: Array<{ delaySeconds?: number }> = [];
  const message: Message = {
    body: value,
    attempts,
    ack: () => {
      acknowledgements.count += 1;
    },
    retry: (options?: { delaySeconds?: number }) => {
      retries.push(options ?? {});
    },
    id: crypto.randomUUID(),
    timestamp: new Date(),
  };

  return { message, acknowledgements, retries };
};

const dispatcher = (failure?: Error) => {
  const requestedUsers: string[] = [];
  const reconciledOrganizations: string[] = [];
  const layer = Layer.succeed(XSyncControl, {
    disconnect: () => Effect.void,
    pause: () => Effect.void,
    reconcile: (userId, orgId) => {
      requestedUsers.push(userId);
      if (orgId) reconciledOrganizations.push(orgId);
      if (failure) {
        return Effect.fail(
          new XSyncSideEffectError({
            op: "DO.reconcile",
            cause: failure,
          })
        );
      }
      return Effect.void;
    },
    resume: () => Effect.void,
    status: () =>
      Effect.succeed({
        connected: false,
        status: "disconnected",
        lastSyncedAt: null,
      }),
  });

  return { requestedUsers, reconciledOrganizations, layer };
};

const run = (
  messages: ReadonlyArray<ReturnType<typeof createMessage>>,
  layer: Layer.Layer<XSyncControl>
) =>
  quiet(
    handleXReconcileBatchEffect({
      messages: messages.map(({ message }) => message),
      queue: "cloudstash-x-reconcile",
      metadata: { metrics: { backlogBytes: 0, backlogCount: 0 } },
      ackAll: () => undefined,
      retryAll: () => undefined,
    } satisfies MessageBatch).pipe(Effect.provide(layer))
  );

describe("X reconciliation Queue", () => {
  it.effect("acks malformed messages without calling a DO", () => {
    const message = createMessage({ userId: 12 });
    const control = dispatcher();

    return run([message], control.layer).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          assert.deepStrictEqual(control.requestedUsers, []);
          assert.deepStrictEqual(control.reconciledOrganizations, []);
          assert.strictEqual(message.acknowledgements.count, 1);
          assert.deepStrictEqual(message.retries, []);
        })
      )
    );
  });

  it.effect("retries transient DO failures with bounded backoff", () => {
    const first = createMessage(body, 1);
    const sixth = createMessage(body, 6);
    const control = dispatcher(new Error("DO unavailable"));

    return run([first, sixth], control.layer).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          assert.deepStrictEqual(first.retries, [{ delaySeconds: 30 }]);
          assert.deepStrictEqual(sixth.retries, [{ delaySeconds: 480 }]);
          assert.strictEqual(first.acknowledgements.count, 0);
          assert.strictEqual(sixth.acknowledgements.count, 0);
          assert.strictEqual(control.requestedUsers.length, 2);
          assert.strictEqual(control.reconciledOrganizations.length, 2);
        })
      )
    );
  });
});
