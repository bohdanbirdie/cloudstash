import { Effect } from "effect";

import type { OrgId, UserId } from "../db/branded";
import { TelegramKeyStore } from "../telegram/services";

/**
 * Forward entries written before the reverse index existed survive this purge.
 * They are functionally inert (apikey FK cascade kills authn) but their
 * chat_ids do persist in KV — accepted residue for legacy connects.
 */
export const purgeTelegramForUser = Effect.fn("AccountDeletion.purgeTelegram")(
  function* (input: { userId: UserId; orgId: OrgId }) {
    yield* Effect.annotateCurrentSpan({
      userId: input.userId,
      orgId: input.orgId,
    });
    const keyStore = yield* TelegramKeyStore;
    const result = yield* keyStore.purgeForUser(input.userId);
    yield* Effect.logInfo("Telegram purge done").pipe(
      Effect.annotateLogs({
        userId: input.userId,
        orgId: input.orgId,
        deletedCount: result.deletedCount,
      })
    );
    return result;
  }
);
