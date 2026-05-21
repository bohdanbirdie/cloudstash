import { Schema } from "effect";

import type { PlanTier, TierCapabilities } from "@/lib/plan";
import { PLAN_ORDER } from "@/lib/plan";

import { OrgId } from "../db/branded";

export class CapabilityDisabledError extends Schema.TaggedError<CapabilityDisabledError>()(
  "CapabilityDisabledError",
  {
    orgId: OrgId,
    capability: Schema.String,
    requiredTier: Schema.Literal(...PLAN_ORDER),
    message: Schema.String,
  }
) {
  static for(
    orgId: OrgId,
    capability: keyof TierCapabilities,
    requiredTier: PlanTier
  ): CapabilityDisabledError {
    return new CapabilityDisabledError({
      orgId,
      capability,
      requiredTier,
      message: `Capability "${capability}" requires the ${requiredTier} plan`,
    });
  }
}

/**
 * Standard 402 Payment Required response for a denied capability gate.
 * Shape is stable so the client can drive an "Upgrade to <tier>" CTA without
 * hard-coding the capability → tier mapping.
 */
export const capabilityDeniedResponse = (
  error: CapabilityDisabledError
): Response =>
  Response.json(
    {
      error: "Upgrade required",
      capability: error.capability,
      requiredTier: error.requiredTier,
    },
    { status: 402 }
  );
