import { eq } from "drizzle-orm";
import { Effect, Data } from "effect";

import * as schema from "../db/schema";
import type { OrgFeatures } from "../db/schema";
import { DbClient } from "../db/service";

export class ChatFeatureDisabledError extends Data.TaggedError(
  "ChatFeatureDisabledError"
)<{
  status: number;
  message: string;
}> {}

export const checkChatFeatureEnabled = (
  workspaceId: string
): Effect.Effect<void, ChatFeatureDisabledError, DbClient> =>
  Effect.gen(function* () {
    const db = yield* DbClient;
    const org = yield* Effect.tryPromise({
      catch: () =>
        new ChatFeatureDisabledError({
          message: "Organization not found",
          status: 403,
        }),
      try: () =>
        db.query.organization.findFirst({
          where: eq(schema.organization.id, workspaceId),
          columns: { features: true },
        }),
    });

    const features = (org?.features as OrgFeatures) ?? {};
    if (!features.chatAgentEnabled) {
      return yield* new ChatFeatureDisabledError({
        message: "Chat feature is not enabled for this workspace",
        status: 403,
      });
    }
  });
