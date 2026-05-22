import { Context } from "effect";
import type { Effect } from "effect";

import type { LinkQueueMessage } from "../../link-processor/types";
import type { XSyncSideEffectError } from "../errors";

/**
 * Thin Effect-side seam over `env.LINK_QUEUE.send`. Encapsulating it as a
 * service keeps `pollOnceEffect` free of `env` and lets tests assert queue
 * payloads via a `Layer.succeed(LinkQueueClient, stub)` mock.
 */
export class LinkQueueClient extends Context.Tag(
  "@cloudstash/x-sync/LinkQueueClient"
)<
  LinkQueueClient,
  {
    readonly send: (
      message: LinkQueueMessage
    ) => Effect.Effect<void, XSyncSideEffectError>;
  }
>() {}
