import { Cause, Context, Effect, Layer } from "effect";

import { APP_URL } from "../config";
import { ConnectNetworkError } from "../errors";
import type { Creds } from "../messages";

export class ConnectClient extends Context.Tag("@ext/ConnectClient")<
  ConnectClient,
  {
    readonly openConnectPage: Effect.Effect<void, ConnectNetworkError>;
    readonly disconnect: (creds: Creds) => Effect.Effect<void>;
  }
>() {
  static readonly layer = Layer.sync(ConnectClient, () => {
    const openConnectPage = Effect.fn("ConnectClient.openConnectPage")(
      function* () {
        yield* Effect.tryPromise({
          try: () => chrome.runtime.sendMessage({ type: "cs:open-connect" }),
          catch: (cause) => new ConnectNetworkError({ cause }),
        });
      }
    )();

    const disconnect = (creds: Creds): Effect.Effect<void> =>
      Effect.gen(function* () {
        const response = yield* Effect.tryPromise(() =>
          fetch(`${APP_URL}/api/connect/extension`, {
            method: "DELETE",
            headers: { authorization: `Bearer ${creds.apiKey}` },
          })
        );
        if (!response.ok) {
          yield* Effect.logWarning("ConnectClient.disconnect non-OK").pipe(
            Effect.annotateLogs({ status: response.status })
          );
        }
      }).pipe(
        Effect.catchAllCause((cause) =>
          Effect.logWarning("ConnectClient.disconnect failed").pipe(
            Effect.annotateLogs({ cause: Cause.pretty(cause) })
          )
        ),
        Effect.withSpan("ConnectClient.disconnect")
      );

    return ConnectClient.of({ openConnectPage, disconnect });
  });
}
