/// <reference types="@cloudflare/workers-types" />
import { Effect, Layer } from "effect";

import type { Env } from "../../shared";
import { sideEffectError } from "../effects-helpers";
import { LinkQueueClient } from "./link-queue-client";

export const LinkQueueClientLive = (namespace: Env["LINK_PROCESSOR_DO"]) =>
  Layer.succeed(LinkQueueClient, {
    send: (input) =>
      Effect.tryPromise({
        try: () =>
          namespace
            .get(namespace.idFromName(input.organizationId))
            .enqueueXBookmark(
              input.usageWindowId,
              input.tweetId,
              input.monthlyLimit,
              input.message
            ),
        catch: sideEffectError("LINK_PROCESSOR_DO.enqueueXBookmark"),
      }).pipe(Effect.withSpan("LinkQueueClient.sendWithinLimit")),
  });
