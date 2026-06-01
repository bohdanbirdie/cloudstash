import { Context, Effect, Layer } from "effect";

import { OffscreenError } from "../errors";

// chrome.offscreen exists only in the MV3 SW context; the popup imports this
// transitively, so probe lazily — a top-level access would crash the popup.
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
    const ensure = Effect.gen(function* () {
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
            url: chrome.runtime.getURL("offscreen.html"),
            reasons: [chrome.offscreen.Reason.WORKERS],
            justification: "Hosts Livestore SharedWorker + sync WebSocket",
          }),
        catch: (cause) => new OffscreenError({ cause }),
      });
    }).pipe(Effect.withSpan("Offscreen.ensure"));

    return Offscreen.of({ ensure });
  });
}
