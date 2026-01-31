import { eq } from "drizzle-orm";
import { Effect, Data } from "effect";

import { createDb } from "../db";
import * as schema from "../db/schema";
import { type OrgFeatures } from "../db/schema";
import { type Env } from "../shared";

export class ChatFeatureDisabledError extends Data.TaggedError(
  "ChatFeatureDisabledError"
)<{
  status: number;
  message: string;
}> {}

export const checkChatFeatureEnabled = (
  workspaceId: string,
  env: Env
): Effect.Effect<void, ChatFeatureDisabledError> =>
  Effect.gen(function* () {
    const db = createDb(env.DB);
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
