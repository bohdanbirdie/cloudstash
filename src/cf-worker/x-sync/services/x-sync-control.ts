import { Context, Effect, Layer } from "effect";

import type { XStatusResponse } from "../../../lib/x-sync-status";
import type { OrgId, UserId } from "../../db/branded";
import type { XBookmarkSyncDO } from "../durable-object";
import { sideEffectError } from "../effects-helpers";
import type { XSyncSideEffectError } from "../errors";

const makeXSyncControl = (
  namespace: DurableObjectNamespace<XBookmarkSyncDO>
) => {
  const stubFor = (userId: UserId): DurableObjectStub<XBookmarkSyncDO> =>
    namespace.get(namespace.idFromName(userId));

  const status: (
    userId: UserId
  ) => Effect.Effect<XStatusResponse, XSyncSideEffectError> = Effect.fn(
    "XSyncControl.status"
  )(function* (userId) {
    return yield* Effect.tryPromise({
      try: () => stubFor(userId).status(),
      catch: sideEffectError("DO.status"),
    });
  });

  return {
    disconnect: Effect.fn("XSyncControl.disconnect")(function* (
      userId: UserId
    ) {
      yield* Effect.tryPromise({
        try: () => stubFor(userId).disconnect(),
        catch: sideEffectError("DO.disconnect"),
      });
    }),
    pause: Effect.fn("XSyncControl.pause")(function* (userId: UserId) {
      yield* Effect.tryPromise({
        try: () => stubFor(userId).pause(),
        catch: sideEffectError("DO.pause"),
      });
    }),
    reconcile: Effect.fn("XSyncControl.reconcile")(function* (
      userId: UserId,
      orgId?: OrgId
    ) {
      yield* Effect.tryPromise({
        try: () => stubFor(userId).reconcile(orgId),
        catch: sideEffectError("DO.reconcile"),
      });
    }),
    reconnect: Effect.fn("XSyncControl.reconnect")(function* (
      userId: UserId,
      orgId?: OrgId
    ) {
      yield* Effect.tryPromise({
        try: () => stubFor(userId).reconnect(orgId),
        catch: sideEffectError("DO.reconnect"),
      });
    }),
    resume: Effect.fn("XSyncControl.resume")(function* (
      userId: UserId,
      orgId?: OrgId
    ) {
      yield* Effect.tryPromise({
        try: () => stubFor(userId).resume(orgId),
        catch: sideEffectError("DO.resume"),
      });
    }),
    status,
  };
};

export class XSyncControl extends Context.Service<
  XSyncControl,
  ReturnType<typeof makeXSyncControl>
>()("@cloudstash/x-sync/services/XSyncControl") {
  static layer(
    namespace: DurableObjectNamespace<XBookmarkSyncDO>
  ): Layer.Layer<XSyncControl> {
    return Layer.succeed(XSyncControl, makeXSyncControl(namespace));
  }
}
