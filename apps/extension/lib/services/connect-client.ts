import { Context, Effect, Layer } from "effect";

import { ConnectNetworkError } from "../errors";

export class ConnectClient extends Context.Tag("@ext/ConnectClient")<
  ConnectClient,
  {
    readonly openConnectPage: Effect.Effect<void, ConnectNetworkError>;
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

    return ConnectClient.of({ openConnectPage });
  });
}
