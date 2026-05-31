import { Context, Effect, Layer, Option, Schema, Stream } from "effect";

import {
  MessengerError,
  StorageError,
  StorageUnsupportedError,
} from "../errors";
import { ApiKey, Creds, CredsPayload, OrgId } from "../messages";
import { safeErrorInfo } from "../safe-error";
import { Messenger } from "./messenger";

const API_KEY = "cs:apiKey";
const ORG_ID = "cs:orgId";

const decodeCreds = Schema.decodeUnknownOption(Creds);

const toCreds = (data: {
  apiKey: string | null;
  orgId: string | null;
}): Creds | null => {
  if (!data.apiKey || !data.orgId) return null;
  return Option.getOrNull(decodeCreds(data));
};

export class CredsStorage extends Context.Tag("@ext/CredsStorage")<
  CredsStorage,
  {
    readonly get: Effect.Effect<Creds | null, StorageError | MessengerError>;
    readonly set: (
      creds: Creds | null
    ) => Effect.Effect<
      void,
      StorageError | StorageUnsupportedError | MessengerError
    >;
    readonly changes: Stream.Stream<
      Creds | null,
      StorageError | MessengerError
    >;
  }
>() {
  static readonly liveLayer = Layer.sync(CredsStorage, () => {
    const get = Effect.fn("CredsStorage.get")(function* () {
      const data = yield* Effect.tryPromise({
        try: () => chrome.storage.local.get([API_KEY, ORG_ID]),
        catch: (cause) => new StorageError({ op: "get", cause }),
      });
      return toCreds({
        apiKey: typeof data[API_KEY] === "string" ? data[API_KEY] : null,
        orgId: typeof data[ORG_ID] === "string" ? data[ORG_ID] : null,
      });
    })();

    const set = Effect.fn("CredsStorage.set")(function* (creds: Creds | null) {
      yield* Effect.tryPromise({
        try: () =>
          creds
            ? chrome.storage.local.set({
                [API_KEY]: creds.apiKey,
                [ORG_ID]: creds.orgId,
              })
            : chrome.storage.local.remove([API_KEY, ORG_ID]),
        catch: (cause) => new StorageError({ op: "set", cause }),
      });
    });

    const changes = Stream.async<Creds | null, StorageError>((emit) => {
      const handler = (
        diff: Record<string, chrome.storage.StorageChange>,
        area: string
      ) => {
        if (area !== "local") return;
        if (!(API_KEY in diff) && !(ORG_ID in diff)) return;
        Effect.runCallback(get, {
          onExit: (exit) => {
            if (exit._tag === "Success") {
              void emit.single(exit.value);
            } else {
              const failure = exit.cause;
              void Effect.runPromise(
                Effect.logWarning("CredsStorage.changes get failed").pipe(
                  Effect.annotateLogs(safeErrorInfo(failure))
                )
              );
            }
          },
        });
      };
      chrome.storage.onChanged.addListener(handler);
      return Effect.sync(() =>
        chrome.storage.onChanged.removeListener(handler)
      );
    });

    return CredsStorage.of({ get, set, changes });
  });

  static readonly proxyLayer = Layer.effect(
    CredsStorage,
    Effect.gen(function* () {
      const messenger = yield* Messenger;

      const get = Effect.fn("CredsStorage.getProxy")(function* () {
        const reply = yield* messenger.request(
          { type: "cs:get-creds" },
          CredsPayload
        );
        return toCreds(reply);
      })();

      const set = (_creds: Creds | null) =>
        Effect.fail(new StorageUnsupportedError({ op: "set" }));

      const changes = messenger.listen.pipe(
        Stream.filterMap((msg) =>
          msg.type === "cs:creds-changed"
            ? Option.some(toCreds(msg.creds))
            : Option.none()
        )
      );

      return CredsStorage.of({ get, set, changes });
    })
  );
}

export { ApiKey, Creds, OrgId };
