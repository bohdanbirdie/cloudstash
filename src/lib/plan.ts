export type PlanTier = "free" | "plus" | "pro";

export type BillingInterval = "month" | "year";

export interface PlanPricing {
  monthly: number;
  yearly: number;
}

export interface PlanInfo {
  id: PlanTier;
  name: string;
  pricing: PlanPricing | null;
  tagline: string;
  features: readonly string[];
  highlighted?: boolean;
  inverted?: boolean;
  badge?: string;
}

export const PLANS: Readonly<Record<PlanTier, PlanInfo>> = {
  free: {
    id: "free",
    name: "Free",
    pricing: null,
    tagline: "The saving core. Yours forever.",
    features: [
      "Save up to 100 links",
      "10 AI summaries each month",
      "Save from the Chrome extension",
      "Tag, archive, search",
      "Sync across your devices",
      "Export everything, anytime",
    ],
  },
  plus: {
    id: "plus",
    name: "Plus",
    pricing: { monthly: 5, yearly: 50 },
    tagline: "Your saves, ready to skim.",
    features: [
      "Save up to 500 links",
      "500 AI summaries each month",
      "Save from Telegram and Raycast",
      "Weekly digest of what you read",
      "Public API",
    ],
    highlighted: true,
    badge: "Most popular",
  },
  pro: {
    id: "pro",
    name: "Pro",
    pricing: { monthly: 12, yearly: 120 },
    tagline: "The full Cloudstash. AI everywhere.",
    features: [
      "Unlimited saved links",
      "X bookmark sync",
      "Chat with your library",
      "Enriched X summaries",
      "MCP server",
    ],
    inverted: true,
    badge: "Best value",
  },
};

export const PLAN_ORDER: readonly PlanTier[] = ["free", "plus", "pro"];

export const PLAN_LIST: readonly PlanInfo[] = PLAN_ORDER.map((id) => PLANS[id]);

export const previousTierName = (tier: PlanTier): string | null =>
  tier === "plus" ? "Free" : tier === "pro" ? "Plus" : null;

export const planPriceDisplay = (plan: PlanInfo, interval: BillingInterval) => {
  if (!plan.pricing) return { amount: 0, suffix: "/ forever" };
  return interval === "year"
    ? { amount: plan.pricing.yearly, suffix: "/ year" }
    : { amount: plan.pricing.monthly, suffix: "/ month" };
};

export const monthlyPriceUsd = (tier: PlanTier) =>
  PLANS[tier].pricing?.monthly ?? 0;

export const yearlySavings = (plan: PlanInfo) => {
  if (!plan.pricing) return null;
  const full = plan.pricing.monthly * 12;
  const amount = full - plan.pricing.yearly;
  if (amount <= 0) return null;
  return { amount, pct: Math.round((amount / full) * 100) };
};

export const maxYearlySavingsPct = () =>
  PLAN_ORDER.reduce((max, id) => {
    const savings = yearlySavings(PLANS[id]);
    return savings && savings.pct > max ? savings.pct : max;
  }, 0);

// Runtime capability surface — what an org can actually do at a given tier.
// Separate from `PlanInfo.features` (marketing copy) on purpose.
export interface TierCapabilities {
  aiSummary: boolean;
  chatAgent: boolean;
  integrations: boolean;
  xBookmarkSync: boolean;
  xContentEnrichment: boolean;
  publicApi: boolean;
  mcpServer: boolean;
  weeklyDigest: boolean;
  maxSavedLinks: number;
  monthlyAiSummaries: number;
  monthlyAssistantCredits: number;
  monthlyExternalCalls: number;
  monthlyXBookmarks: number;
  monthlyXEnrichments: number;
}

export const TIER_CAPABILITIES: Readonly<Record<PlanTier, TierCapabilities>> = {
  free: {
    aiSummary: true,
    chatAgent: false,
    integrations: false,
    xBookmarkSync: false,
    xContentEnrichment: false,
    publicApi: false,
    mcpServer: false,
    weeklyDigest: false,
    maxSavedLinks: 100,
    monthlyAiSummaries: 10,
    monthlyAssistantCredits: 0,
    monthlyExternalCalls: 0,
    monthlyXBookmarks: 0,
    monthlyXEnrichments: 0,
  },
  plus: {
    aiSummary: true,
    chatAgent: false,
    integrations: true,
    xBookmarkSync: false,
    xContentEnrichment: false,
    publicApi: true,
    mcpServer: false,
    weeklyDigest: true,
    maxSavedLinks: 500,
    monthlyAiSummaries: 500,
    monthlyAssistantCredits: 0,
    monthlyExternalCalls: 1_000,
    monthlyXBookmarks: 0,
    monthlyXEnrichments: 0,
  },
  pro: {
    aiSummary: true,
    chatAgent: true,
    integrations: true,
    xBookmarkSync: true,
    xContentEnrichment: true,
    publicApi: true,
    mcpServer: true,
    weeklyDigest: true,
    // Zero means product-unlimited. Private abuse controls are operational,
    // not a customer-visible plan allowance.
    maxSavedLinks: 0,
    monthlyAiSummaries: 1_000,
    monthlyAssistantCredits: 1_000,
    monthlyExternalCalls: 10_000,
    monthlyXBookmarks: 200,
    monthlyXEnrichments: 100,
  },
};

export const capabilitiesFor = (tier: PlanTier): TierCapabilities =>
  TIER_CAPABILITIES[tier];

export type CapabilityOverrides = Partial<TierCapabilities>;

export const mergeCapabilities = (
  tier: PlanTier,
  overrides: CapabilityOverrides | null | undefined
): TierCapabilities => {
  const merged = { ...TIER_CAPABILITIES[tier], ...overrides };

  if (
    overrides?.chatAgent === true &&
    overrides.monthlyAssistantCredits === undefined
  ) {
    merged.monthlyAssistantCredits = Math.max(
      merged.monthlyAssistantCredits,
      TIER_CAPABILITIES.pro.monthlyAssistantCredits
    );
  }
  if (
    overrides?.aiSummary === true &&
    overrides.monthlyAiSummaries === undefined
  ) {
    merged.monthlyAiSummaries = Math.max(
      merged.monthlyAiSummaries,
      TIER_CAPABILITIES.free.monthlyAiSummaries
    );
  }
  if (
    overrides?.publicApi === true &&
    overrides.monthlyExternalCalls === undefined
  ) {
    merged.monthlyExternalCalls = Math.max(
      merged.monthlyExternalCalls,
      TIER_CAPABILITIES.plus.monthlyExternalCalls
    );
  }
  if (
    overrides?.mcpServer === true &&
    overrides.monthlyExternalCalls === undefined
  ) {
    merged.monthlyExternalCalls = Math.max(
      merged.monthlyExternalCalls,
      TIER_CAPABILITIES.pro.monthlyExternalCalls
    );
  }
  if (
    overrides?.xBookmarkSync === true &&
    overrides.monthlyXBookmarks === undefined
  ) {
    merged.monthlyXBookmarks = Math.max(
      merged.monthlyXBookmarks,
      TIER_CAPABILITIES.pro.monthlyXBookmarks
    );
  }
  if (
    overrides?.xContentEnrichment === true &&
    overrides.monthlyXEnrichments === undefined
  ) {
    merged.monthlyXEnrichments = Math.max(
      merged.monthlyXEnrichments,
      TIER_CAPABILITIES.pro.monthlyXEnrichments
    );
  }

  return merged;
};

export type BooleanCapability = {
  [K in keyof TierCapabilities]: TierCapabilities[K] extends boolean
    ? K
    : never;
}[keyof TierCapabilities];

// Lowest tier at which a boolean capability becomes true — tells the client
// which tier to upgrade to when a gate denies a request.
export const requiredTierForBooleanCap = (cap: BooleanCapability): PlanTier => {
  for (const tier of PLAN_ORDER) {
    if (TIER_CAPABILITIES[tier][cap]) return tier;
  }
  return "pro";
};
