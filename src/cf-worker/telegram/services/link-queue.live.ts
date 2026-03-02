import { Effect, Layer } from "effect";

import { type LinkQueueMessage } from "../../link-processor/types";
import { type Env } from "../../shared";
import { LinkQueue } from "../services";

export const LinkQueueLive = (
  env: Env,
  chatId: number,
  messageId: number | undefined
) =>
  Layer.succeed(LinkQueue, {
    enqueue: (url, storeId) =>
      Effect.tryPromise({
        catch: (error) => new Error(`Queue send failed: ${error}`),
        try: () =>
          env.LINK_QUEUE.send({
            source: "telegram",
            sourceMeta: JSON.stringify({ chatId, messageId }),
            storeId,
            url,
          } satisfies LinkQueueMessage),
      }),
  });
