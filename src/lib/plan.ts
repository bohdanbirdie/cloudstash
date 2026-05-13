export type PlanTier = "free" | "plus" | "pro";

export interface PlanInfo {
  id: PlanTier;
  name: string;
  price: number;
  /** Suffix shown next to the price ("/ forever", "/ month") */
  priceSuffix: string;
  /** Short positioning line shown beneath the price */
  tagline: string;
  /** Concrete features added at this tier (do not repeat lower tiers) */
  features: readonly string[];
  /** "Plus is highlighted" — primary-tinted treatment */
  highlighted?: boolean;
  /** "Pro is inverted" — dark-on-light treatment */
  inverted?: boolean;
  /** Tagline-style badge ("Popular", "Power user") */
  badge?: string;
}

export const PLANS: Readonly<Record<PlanTier, PlanInfo>> = {
  free: {
    id: "free",
    name: "Free",
    price: 0,
    priceSuffix: "/ forever",
    tagline: "The saving core. Yours forever.",
    features: [
      "Save links from the dashboard",
      "Tag, archive, search",
      "Sync across your devices",
      "Export everything, anytime",
    ],
  },
  plus: {
    id: "plus",
    name: "Plus",
    price: 5,
    priceSuffix: "/ month",
    tagline: "Save from anywhere. AI does the reading.",
    features: [
      "AI summary on every save",
      "Save from Telegram, Raycast, iOS, Chrome, and X",
      "Public API",
    ],
    highlighted: true,
    badge: "Popular",
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 12,
    priceSuffix: "/ month",
    tagline: "Bigger AI, deeper access.",
    features: ["Chat with your archive", "Larger summary model", "MCP server"],
    inverted: true,
    badge: "Power user",
  },
};

export const PLAN_ORDER: readonly PlanTier[] = ["free", "plus", "pro"];

export const PLAN_LIST: readonly PlanInfo[] = PLAN_ORDER.map((id) => PLANS[id]);
