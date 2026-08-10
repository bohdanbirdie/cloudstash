import { Context, Effect, Layer, Queue, Result, Schema, Stream } from "effect";

import { MessengerError } from "../errors";
import { decodeExtMessage } from "../messages";
import type { ExtMessage } from "../messages";

export class Messenger extends Context.Service<
  Messenger,
  {
    readonly send: (
      message: ExtMessage
    ) => Effect.Effect<unknown, MessengerError>;
    readonly request: <A, I>(
      message: ExtMessage,
      replySchema: Schema.Codec<A, I>
    ) => Effect.Effect<A, MessengerError>;
    readonly listen: Stream.Stream<ExtMessage, MessengerError>;
  }
>()("@ext/Messenger") {
  static readonly layer = Layer.sync(Messenger, () => {
    const send = (message: ExtMessage) =>
      Effect.tryPromise({
        try: () => chrome.runtime.sendMessage(message),
        catch: (cause) => new MessengerError({ cause }),
      }).pipe(Effect.withSpan("Messenger.send"));

    const request = <A, I>(
      message: ExtMessage,
      replySchema: Schema.Codec<A, I>
    ) =>
      send(message).pipe(
        Effect.flatMap((reply) =>
          Schema.decodeUnknownEffect(replySchema)(reply).pipe(
            Effect.mapError((cause) => new MessengerError({ cause }))
          )
        ),
        Effect.withSpan("Messenger.request")
      );

    const listen = Stream.callback<ExtMessage, MessengerError>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const handler = (msg: unknown) => {
            const decoded = decodeExtMessage(msg);
            if (Result.isSuccess(decoded)) {
              Queue.offerUnsafe(queue, decoded.success);
            }
          };
          chrome.runtime.onMessage.addListener(handler);
          return handler;
        }),
        (handler) =>
          Effect.sync(() => chrome.runtime.onMessage.removeListener(handler))
      )
    );

    return Messenger.of({ send, request, listen });
  });
}
