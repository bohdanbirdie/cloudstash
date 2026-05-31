import { Context, Effect, Either, Layer, Schema, Stream } from "effect";

import { MessengerError } from "../errors";
import { decodeExtMessage } from "../messages";
import type { ExtMessage } from "../messages";

export class Messenger extends Context.Tag("@ext/Messenger")<
  Messenger,
  {
    readonly send: (
      message: ExtMessage
    ) => Effect.Effect<unknown, MessengerError>;
    readonly request: <A, I, R>(
      message: ExtMessage,
      replySchema: Schema.Schema<A, I, R>
    ) => Effect.Effect<A, MessengerError, R>;
    readonly listen: Stream.Stream<ExtMessage, MessengerError>;
  }
>() {
  static readonly layer = Layer.sync(Messenger, () => {
    const send = Effect.fn("Messenger.send")(function* (message: ExtMessage) {
      return yield* Effect.tryPromise({
        try: () => chrome.runtime.sendMessage(message),
        catch: (cause) => new MessengerError({ cause }),
      });
    });

    const request = <A, I, R>(
      message: ExtMessage,
      replySchema: Schema.Schema<A, I, R>
    ) =>
      send(message).pipe(
        Effect.flatMap((reply) =>
          Schema.decodeUnknown(replySchema)(reply).pipe(
            Effect.mapError((cause) => new MessengerError({ cause }))
          )
        ),
        Effect.withSpan("Messenger.request")
      );

    const listen = Stream.async<ExtMessage, MessengerError>((emit) => {
      const handler = (msg: unknown) => {
        Either.match(decodeExtMessage(msg), {
          onLeft: () => undefined,
          onRight: (m) => {
            void emit.single(m);
          },
        });
      };
      chrome.runtime.onMessage.addListener(handler);
      return Effect.sync(() =>
        chrome.runtime.onMessage.removeListener(handler)
      );
    });

    return Messenger.of({ send, request, listen });
  });
}
