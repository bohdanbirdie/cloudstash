import { Context } from "effect";
import type { Effect } from "effect";

import type { LinkQueueMessage } from "../../link-processor/types";
import type { XSyncSideEffectError } from "../errors";

export class LinkQueueClient extends Context.Service<
  LinkQueueClient,
  {
    readonly send: (
      message: LinkQueueMessage
    ) => Effect.Effect<void, XSyncSideEffectError>;
  }
>()("@cloudstash/x-sync/LinkQueueClient") {}
