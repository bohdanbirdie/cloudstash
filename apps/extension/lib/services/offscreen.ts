import { Context, Effect, Layer } from "effect";

import { OffscreenError } from "../errors";

// chrome.offscreen is only defined in MV3 service-worker contexts. The popup
// imports this module transitively via layers.ts, so any top-level access
// would crash before the layer is even selected. Probe lazily.
const hasDocumentSupported = () =>
  typeof chrome !== "undefined" &&
  typeof chrome.offscreen?.hasDocument === "function";

export class Offscreen extends Context.Tag("@ext/Offscreen")<
  Offscreen,
  {
    readonly ensure: Effect.Effect<void, OffscreenError>;
  }
>() {
  static readonly layer = Layer.sync(Offscreen, () => {
    const ensure = Effect.fn("Offscreen.ensure")(function* () {
      const url = chrome.runtime.getURL("offscreen.html");
      if (hasDocumentSupported()) {
        const exists = yield* Effect.tryPromise({
          try: () => chrome.offscreen.hasDocument(),
          catch: (cause) => new OffscreenError({ cause }),
        });
        if (exists) return;
      }
      yield* Effect.tryPromise({
        try: () =>
          chrome.offscreen.createDocument({
            url,
            reasons: [chrome.offscreen.Reason.WORKERS],
            justification: "Hosts Livestore SharedWorker + sync WebSocket",
          }),
        catch: (cause) => new OffscreenError({ cause }),
      });
    });

    return Offscreen.of({ ensure: ensure() });
  });
}
