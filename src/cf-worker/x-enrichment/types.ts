import type { OrgId } from "../db/branded";

export const ENRICHMENT_MODEL = "google/gemini-2.5-flash";

export const MONTHLY_ENRICHMENT_CAP = 100;

export const ENRICHMENT_USAGE_KEY = (storeId: OrgId, period: string) =>
  `enrichment:${storeId}:${period}`;

export const getCurrentPeriod = (): string =>
  new Date().toISOString().slice(0, 7);

export const isXTweetUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    const isHost = u.hostname === "x.com" || u.hostname === "twitter.com";
    return isHost && /\/status\/\d+/.test(u.pathname);
  } catch {
    return false;
  }
};
