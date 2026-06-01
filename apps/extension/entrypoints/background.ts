import { Effect, Either, ManagedRuntime, Stream } from "effect";

import { APP_URL } from "../lib/config";
import { BackgroundLayer } from "../lib/layers";
import { decodeExternalMessage, decodeExtMessage } from "../lib/messages";
import type { ConnectExtMsg } from "../lib/messages";
import { safeErrorInfo } from "../lib/safe-error";
import { CredsStorage } from "../lib/services/creds-storage";
import { Offscreen } from "../lib/services/offscreen";

const runtime = ManagedRuntime.make(BackgroundLayer);

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

export default defineBackground(() => {
  const ensure = () => void runtime.runPromise(ensureOffscreen);

  chrome.runtime.onInstalled.addListener(ensure);
  chrome.runtime.onStartup.addListener(ensure);
  ensure();

  runtime.runFork(broadcastCredsChanges);

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const decoded = decodeExtMessage(msg);
    if (Either.isLeft(decoded)) return undefined;
    const message = decoded.right;
    if (message.type === "cs:get-creds") {
      void runtime.runPromise(handleGetCreds(sendResponse));
      return true;
    }
    if (message.type === "cs:open-connect") {
      void runtime.runPromise(handleOpenConnect(sendResponse));
      return true;
    }
    return undefined;
  });

  chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
    const decoded = decodeExternalMessage(msg);
    if (Either.isLeft(decoded)) return undefined;
    const message = decoded.right;
    void runtime.runPromise(
      Effect.logDebug("[background] external message").pipe(
        Effect.annotateLogs({
          origin: sender.origin ?? "unknown",
          type: message.type,
        })
      )
    );
    if (message.type === "cs:ping") {
      void runtime.runPromise(handlePing(sendResponse));
      return true;
    }
    void runtime.runPromise(handleExternalConnect(message, sendResponse));
    return true;
  });
});
