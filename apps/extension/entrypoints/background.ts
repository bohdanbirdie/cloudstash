import { Effect, Either, Stream } from "effect";

import { APP_URL } from "../lib/config";
import { BackgroundLayer } from "../lib/layers";
import { decodeExternalMessage, decodeExtMessage } from "../lib/messages";
import type { ConnectExtMsg } from "../lib/messages";
import { safeErrorInfo } from "../lib/safe-error";
import { CredsStorage } from "../lib/services/creds-storage";
import { Offscreen } from "../lib/services/offscreen";

const ensureOffscreen = Effect.gen(function* () {
  const offscreen = yield* Offscreen;
  yield* offscreen.ensure;
}).pipe(
  Effect.tapError((cause) =>
    Effect.logError("[background] ensureOffscreen failed").pipe(
      Effect.annotateLogs(safeErrorInfo(cause))
    )
  ),
  Effect.ignore
);

const broadcastCredsChanges = Effect.gen(function* () {
  const creds = yield* CredsStorage;
  yield* creds.changes.pipe(
    Stream.runForEach((next) =>
      Effect.tryPromise({
        try: () =>
          chrome.runtime.sendMessage({
            type: "cs:creds-changed",
            creds: {
              apiKey: next?.apiKey ?? null,
              orgId: next?.orgId ?? null,
            },
          }),
        catch: (cause) => cause,
      }).pipe(
        // Receiver-absent (no listener registered) is expected when the
        // offscreen document hasn't booted yet — silently swallow that
        // specific shape, but log anything else.
        Effect.tapError((cause) =>
          Effect.logDebug("[background] creds broadcast failed").pipe(
            Effect.annotateLogs(safeErrorInfo(cause))
          )
        ),
        Effect.ignore
      )
    )
  );
});

const handleGetCreds = (sendResponse: (data: unknown) => void) =>
  Effect.gen(function* () {
    const creds = yield* CredsStorage;
    const current = yield* creds.get;
    sendResponse({
      apiKey: current?.apiKey ?? null,
      orgId: current?.orgId ?? null,
    });
  }).pipe(
    Effect.tapError((cause) =>
      Effect.logWarning("[background] get-creds failed").pipe(
        Effect.annotateLogs(safeErrorInfo(cause))
      )
    ),
    Effect.catchAll((cause) =>
      Effect.sync(() => {
        const info = safeErrorInfo(cause);
        sendResponse({
          apiKey: null,
          orgId: null,
          error: info.tag ?? info.errorType,
        });
      })
    )
  );

// Session handoff from the web app: it mints an API key (cookie-authed) and
// pushes it here over externally_connectable, replacing the manual code.
const handlePing = (sendResponse: (data: unknown) => void) =>
  Effect.gen(function* () {
    const creds = yield* CredsStorage;
    const current = yield* creds.get;
    sendResponse({ ok: true, connected: current !== null });
  }).pipe(
    Effect.catchAll(() =>
      Effect.sync(() => sendResponse({ ok: true, connected: false }))
    )
  );

const handleOpenConnect = (sendResponse: (data: unknown) => void) =>
  Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () =>
        chrome.windows.create({
          url: `${APP_URL}/connect/extension`,
          type: "popup",
          width: 460,
          height: 720,
          focused: true,
        }),
      catch: (cause) => cause,
    });
    sendResponse({ ok: true });
  }).pipe(
    Effect.tapError((cause) =>
      Effect.logWarning("[background] open connect window failed").pipe(
        Effect.annotateLogs(safeErrorInfo(cause))
      )
    ),
    Effect.catchAll(() => Effect.sync(() => sendResponse({ ok: false })))
  );

const handleExternalConnect = (
  message: ConnectExtMsg,
  sendResponse: (data: unknown) => void
) =>
  Effect.gen(function* () {
    const creds = yield* CredsStorage;
    yield* creds.set({ apiKey: message.apiKey, orgId: message.orgId });
    yield* Effect.logInfo("[background] external connect stored creds").pipe(
      Effect.annotateLogs({ orgId: message.orgId })
    );
    sendResponse({ ok: true });
  }).pipe(
    Effect.tapError((cause) =>
      Effect.logWarning("[background] external connect failed").pipe(
        Effect.annotateLogs(safeErrorInfo(cause))
      )
    ),
    Effect.catchAll(() => Effect.sync(() => sendResponse({ ok: false })))
  );

const runP = <A, E>(eff: Effect.Effect<A, E>): Promise<A> =>
  Effect.runPromise(eff);

const runFork = <A, E>(eff: Effect.Effect<A, E>) => Effect.runFork(eff);

export default defineBackground(() => {
  const ensure = () =>
    void runP(ensureOffscreen.pipe(Effect.provide(BackgroundLayer)));

  chrome.runtime.onInstalled.addListener(ensure);
  chrome.runtime.onStartup.addListener(ensure);
  ensure();

  runFork(broadcastCredsChanges.pipe(Effect.provide(BackgroundLayer)));

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const decoded = decodeExtMessage(msg);
    if (Either.isLeft(decoded)) return undefined;
    const message = decoded.right;
    if (message.type === "cs:get-creds") {
      void runP(
        handleGetCreds(sendResponse).pipe(Effect.provide(BackgroundLayer))
      );
      return true;
    }
    if (message.type === "cs:open-connect") {
      void runP(
        handleOpenConnect(sendResponse).pipe(Effect.provide(BackgroundLayer))
      );
      return true;
    }
    return undefined;
  });

  // From the web app only (externally_connectable gates the sender origin).
  chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    const decoded = decodeExternalMessage(msg);
    if (Either.isLeft(decoded)) return undefined;
    const message = decoded.right;
    void runP(
      Effect.logDebug("[background] external message").pipe(
        Effect.annotateLogs({
          origin: sender.origin ?? "unknown",
          type: message.type,
        })
      )
    );
    if (message.type === "cs:ping") {
      void runP(handlePing(sendResponse).pipe(Effect.provide(BackgroundLayer)));
      return true;
    }
    void runP(
      handleExternalConnect(message, sendResponse).pipe(
        Effect.provide(BackgroundLayer)
      )
    );
    return true;
  });
});
