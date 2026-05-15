import { Effect, Schema } from "effect";

import type { OrgId } from "../db/branded";
import { OrgFeatures } from "../org/features-service";

export class ChatFeatureDisabledError extends Schema.TaggedError<ChatFeatureDisabledError>()(
  "ChatFeatureDisabledError",
  {
    status: Schema.Number,
    message: Schema.String,
  }
) {}

export class FeatureCheckUnavailableError extends Schema.TaggedError<FeatureCheckUnavailableError>()(
  "FeatureCheckUnavailableError",
  {
    status: Schema.Number,
    message: Schema.String,
    cause: Schema.Defect,
  }
) {}

export class UnknownAgentPartyError extends Schema.TaggedError<UnknownAgentPartyError>()(
  "UnknownAgentPartyError",
  {
    status: Schema.Number,
    message: Schema.String,
    party: Schema.String,
  }
) {}

export const checkChatFeatureEnabled = Effect.fn(
  "ChatAgent.checkChatFeatureEnabled"
)(function* (workspaceId: OrgId) {
  const orgFeatures = yield* OrgFeatures;
  const features = yield* orgFeatures.get(workspaceId);

  if (!features.chatAgentEnabled) {
    return yield* new ChatFeatureDisabledError({
      message: "Chat feature is not enabled for this workspace",
      status: 403,
    });
  }
});
