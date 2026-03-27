import { Effect, Data } from "effect";

import type { DbError } from "../db/service";
import { OrgFeatures } from "../org/features-service";

export class ChatFeatureDisabledError extends Data.TaggedError(
  "ChatFeatureDisabledError"
)<{
  status: number;
  message: string;
}> {}

export const checkChatFeatureEnabled = (
  workspaceId: string
): Effect.Effect<void, ChatFeatureDisabledError | DbError, OrgFeatures> =>
  Effect.gen(function* () {
    const orgFeatures = yield* OrgFeatures;
    const features = yield* orgFeatures.get(workspaceId);

    if (!features.chatAgentEnabled) {
      return yield* new ChatFeatureDisabledError({
        message: "Chat feature is not enabled for this workspace",
        status: 403,
      });
    }
  });
