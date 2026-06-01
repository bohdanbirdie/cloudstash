import { makePersistedAdapter } from "@livestore/adapter-web";
import { createStorePromise } from "@livestore/livestore";
import type { Store } from "@livestore/livestore";
import { schema } from "@web/livestore/schema";
import { Context, Effect, Layer, Ref } from "effect";

import { LivestoreBootError, LivestoreShutdownError } from "../errors";
import LiveStoreSharedWorker from "../livestore-shared-worker?sharedworker";
import LiveStoreWorker from "../livestore.worker?worker";
import type { Creds } from "../messages";
import { safeErrorInfo } from "../safe-error";

type HostedStore = Store<typeof schema>;
type State = { store: HostedStore; creds: Creds } | null;

const sameCreds = (a: Creds, b: Creds) =>
  a.apiKey === b.apiKey && a.orgId === b.orgId;

export class LivestoreHost extends Context.Tag("@ext/LivestoreHost")<
  LivestoreHost,
  {
    readonly reconcile: (
      creds: Creds | null
    ) => Effect.Effect<void, LivestoreBootError>;
  }
>() {
  static readonly layer = Layer.effect(
    LivestoreHost,
    Effect.gen(function* () {
      const adapter = makePersistedAdapter({
        sharedWorker: LiveStoreSharedWorker,
        storage: { type: "opfs" },
        worker: LiveStoreWorker,
      });
      const stateRef = yield* Ref.make<State>(null);

      const shutdown = Effect.fn("LivestoreHost.shutdown")(function* () {
        const state = yield* Ref.get(stateRef);
        if (!state) return;
        yield* Effect.tryPromise({
          try: () => state.store.shutdownPromise(),
          catch: (cause) => new LivestoreShutdownError({ cause }),
        }).pipe(
          Effect.tapError((error) =>
            Effect.logWarning("[offscreen] shutdown error").pipe(
              Effect.annotateLogs(safeErrorInfo(error.cause))
            )
          ),
          Effect.ignore
        );
        yield* Ref.set(stateRef, null);
      });

      const boot = Effect.fn("LivestoreHost.boot")(function* (creds: Creds) {
        yield* Effect.logInfo("[offscreen] booting store").pipe(
          Effect.annotateLogs({ orgId: creds.orgId })
        );
        const store = yield* Effect.tryPromise({
          try: () =>
            createStorePromise({
              adapter,
              schema,
              storeId: creds.orgId,
              syncPayload: { apiKey: creds.apiKey },
            }),
          catch: (cause) => new LivestoreBootError({ cause }),
        });
        yield* Ref.set(stateRef, { store, creds });
        yield* Effect.logInfo("[offscreen] store ready");
      });

      const reconcile = Effect.fn("LivestoreHost.reconcile")(function* (
        creds: Creds | null
      ) {
        if (!creds) {
          yield* shutdown();
          return;
        }
        const state = yield* Ref.get(stateRef);
        if (state && sameCreds(state.creds, creds)) return;
        yield* shutdown();
        yield* boot(creds);
      });

      return LivestoreHost.of({ reconcile });
    })
  );
}
