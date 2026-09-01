import { OPENROUTER_MODEL_ID } from "../openrouter-model";

export const ENRICHMENT_MODEL = OPENROUTER_MODEL_ID;

export const isXTweetUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    const isHost = u.hostname === "x.com" || u.hostname === "twitter.com";
    return isHost && /\/status\/\d+/.test(u.pathname);
  } catch {
    return false;
  }
};
