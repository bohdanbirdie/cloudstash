import { Effect, Stream } from "effect";

import { OffscreenLayer } from "../../lib/layers";
import { safeErrorInfo } from "../../lib/safe-error";
import { CredsStorage } from "../../lib/services/creds-storage";
import { LivestoreHost } from "../../lib/services/livestore-host";

const supervise = Effect.gen(function* () {
  const creds = yield* CredsStorage;
  const host = yield* LivestoreHost;

  const initial = yield* creds.get.pipe(
    Effect.tapError((cause) =>
      Effect.logWarning("[offscreen] initial creds load failed").pipe(
        Effect.annotateLogs(safeErrorInfo(cause))
      )
    ),
    Effect.catchAll(() => Effect.succeed(null))
  );
  yield* host.reconcile(initial).pipe(
    Effect.tapError((cause) =>
      Effect.logError("[offscreen] initial reconcile failed").pipe(
        Effect.annotateLogs(safeErrorInfo(cause))
      )
    ),
    Effect.ignore
  );

  yield* creds.changes.pipe(
    Stream.runForEach((next) =>
      host.reconcile(next).pipe(
        Effect.tapError((cause) =>
          Effect.logError("[offscreen] reconcile failed").pipe(
            Effect.annotateLogs(safeErrorInfo(cause))
          )
        ),
        Effect.ignore
      )
    )
  );
});

Effect.runFork(supervise.pipe(Effect.provide(OffscreenLayer)));
