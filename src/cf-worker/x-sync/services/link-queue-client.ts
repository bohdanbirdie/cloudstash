import { Context } from "effect";
import type { Effect } from "effect";

import type { OrgId } from "../../db/branded";
import type { LinkQueueMessage } from "../../link-processor/types";
import type { XBookmarkEnqueueOutcome } from "../../link-processor/x-bookmark-usage";
import type { XSyncSideEffectError } from "../errors";

export class LinkQueueClient extends Context.Service<
  LinkQueueClient,
  {
    readonly send: (input: {
      readonly organizationId: OrgId;
      readonly usageWindowId: string;
      readonly monthlyLimit: number;
      readonly tweetId: string;
      readonly message: LinkQueueMessage;
    }) => Effect.Effect<XBookmarkEnqueueOutcome, XSyncSideEffectError>;
  }
>()("@cloudstash/x-sync/LinkQueueClient") {}
