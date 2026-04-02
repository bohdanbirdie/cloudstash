import { Effect, Schema } from "effect";

import { OrgFeatures } from "../org/features-service";

export class ChatFeatureDisabledError extends Schema.TaggedError<ChatFeatureDisabledError>()(
  "ChatFeatureDisabledError",
  {
    status: Schema.Number,
    message: Schema.String,
  }
) {}

export const checkChatFeatureEnabled = Effect.fn("ChatAgent.checkChatFeatureEnabled")(
  function* (workspaceId: string) {
    const orgFeatures = yield* OrgFeatures;
    const features = yield* orgFeatures.get(workspaceId);

    if (!features.chatAgentEnabled) {
      return yield* new ChatFeatureDisabledError({
        message: "Chat feature is not enabled for this workspace",
        status: 403,
      });
    }
  }
);
