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
    readonly request: <S extends Schema.Schema.AnyNoContext>(
      message: ExtMessage,
      replySchema: S
    ) => Effect.Effect<Schema.Schema.Type<S>, MessengerError>;
    readonly listen: Stream.Stream<ExtMessage, MessengerError>;
  }
>() {
  static readonly layer = Layer.sync(Messenger, () => {
    const send = (message: ExtMessage) =>
      Effect.tryPromise({
        try: () => chrome.runtime.sendMessage(message),
        catch: (cause) => new MessengerError({ cause }),
      }).pipe(Effect.withSpan("Messenger.send"));

    const request = <S extends Schema.Schema.AnyNoContext>(
      message: ExtMessage,
      replySchema: S
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
        const decoded = decodeExtMessage(msg);
        if (Either.isRight(decoded)) void emit.single(decoded.right);
      };
      chrome.runtime.onMessage.addListener(handler);
      return Effect.sync(() =>
        chrome.runtime.onMessage.removeListener(handler)
      );
    });

    return Messenger.of({ send, request, listen });
  });
}
