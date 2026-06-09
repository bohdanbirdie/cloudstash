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
      "Save links from the dashboard",
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
    tagline: "Every save, summarized by AI.",
    features: [
      "AI summary on every save",
      "Save from Telegram, Raycast, and iOS",
      "Weekly digest of what you read",
      "Public API",
    ],
    highlighted: true,
    badge: "Popular",
  },
  pro: {
    id: "pro",
    name: "Pro",
    pricing: { monthly: 12, yearly: 120 },
    tagline: "The full Cloudstash. AI everywhere.",
    features: [
      "X bookmark sync",
      "Chat with your archive",
      "Larger summary model",
      "MCP server",
    ],
    inverted: true,
    badge: "Power user",
  },
};

export const PLAN_ORDER: readonly PlanTier[] = ["free", "plus", "pro"];

export const PLAN_LIST: readonly PlanInfo[] = PLAN_ORDER.map((id) => PLANS[id]);

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
  monthlyChatBudgetUsd: number;
}

export const TIER_CAPABILITIES: Readonly<Record<PlanTier, TierCapabilities>> = {
  free: {
    aiSummary: false,
    chatAgent: false,
    integrations: false,
    xBookmarkSync: false,
    xContentEnrichment: false,
    publicApi: false,
    mcpServer: false,
    weeklyDigest: false,
    monthlyChatBudgetUsd: 0,
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
    monthlyChatBudgetUsd: 0,
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
    monthlyChatBudgetUsd: 5,
  },
};

export const capabilitiesFor = (tier: PlanTier): TierCapabilities =>
  TIER_CAPABILITIES[tier];

export type CapabilityOverrides = Partial<TierCapabilities>;

export const mergeCapabilities = (
  tier: PlanTier,
  overrides: CapabilityOverrides | null | undefined
): TierCapabilities => ({ ...TIER_CAPABILITIES[tier], ...overrides });

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
