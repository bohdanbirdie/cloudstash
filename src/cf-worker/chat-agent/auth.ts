import { Effect, Schema } from "effect";

import { Billing } from "../billing/service";
import { OrgId } from "../db/branded";
import { maskId } from "../log-utils";

export class ChatFeatureDisabledError extends Schema.TaggedError<ChatFeatureDisabledError>()(
  "ChatFeatureDisabledError",
  {
    orgId: OrgId,
  }
) {}

export class FeatureCheckUnavailableError extends Schema.TaggedError<FeatureCheckUnavailableError>()(
  "FeatureCheckUnavailableError",
  {
    orgId: OrgId,
    cause: Schema.Defect,
  }
) {}

export class UnknownAgentPartyError extends Schema.TaggedError<UnknownAgentPartyError>()(
  "UnknownAgentPartyError",
  {
    party: Schema.String,
  }
) {}

export const checkChatFeatureEnabled = Effect.fn(
  "ChatAgent.checkChatFeatureEnabled"
)(function* (workspaceId: OrgId) {
  const billing = yield* Billing;
  const caps = yield* billing.capabilities(workspaceId);

  yield* Effect.annotateCurrentSpan({
    chatAgent: caps.chatAgent,
    orgId: maskId(workspaceId),
  });

  if (!caps.chatAgent) {
    yield* Effect.logInfo("ChatAgent gate denied").pipe(
      Effect.annotateLogs({ orgId: maskId(workspaceId) })
    );
    return yield* new ChatFeatureDisabledError({ orgId: workspaceId });
  }

  yield* Effect.logDebug("ChatAgent gate allowed").pipe(
    Effect.annotateLogs({
      orgId: maskId(workspaceId),
      monthlyChatBudgetUsd: caps.monthlyChatBudgetUsd,
    })
  );
});
