/// <reference types="@cloudflare/workers-types" />
import { Effect, Layer } from "effect";

import type { LinkQueueMessage } from "../../link-processor/types";
import { sideEffectError } from "../effects-helpers";
import { LinkQueueClient } from "./link-queue-client";

export const LinkQueueClientLive = (queue: Queue<LinkQueueMessage>) =>
  Layer.succeed(LinkQueueClient, {
    send: (message) =>
      Effect.tryPromise({
        try: () => queue.send(message),
        catch: sideEffectError("LINK_QUEUE.send"),
      }).pipe(Effect.withSpan("LinkQueueClient.send")),
  });
