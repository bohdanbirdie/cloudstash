type ErrorLike = {
  statusCode?: number;
  lastError?: { statusCode?: number };
  message?: string;
};

const isObject = (e: unknown): e is ErrorLike =>
  e !== null && typeof e === "object";

const hasRateLimitStatus = (e: ErrorLike): boolean =>
  e.statusCode === 429 || e.lastError?.statusCode === 429;

const hasRateLimitMessage = (e: ErrorLike): boolean =>
  typeof e.message === "string" &&
  e.message.toLowerCase().includes("rate limit");

export const isRateLimitError = (error: unknown): boolean =>
  isObject(error) && (hasRateLimitStatus(error) || hasRateLimitMessage(error));

// OpenRouter returns 402 when credit/spending limit is hit
const hasCreditLimitStatus = (e: ErrorLike): boolean =>
  e.statusCode === 402 || e.lastError?.statusCode === 402;

const hasCreditLimitMessage = (e: ErrorLike): boolean =>
  typeof e.message === "string" &&
  (e.message.toLowerCase().includes("insufficient credits") ||
    e.message.toLowerCase().includes("credit limit"));

export const isCreditLimitError = (error: unknown): boolean =>
  isObject(error) &&
  (hasCreditLimitStatus(error) || hasCreditLimitMessage(error));

export const extractRetryTime = (error: unknown): string => {
  const msg =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);

  const exactMatch = msg.match(/try again in (\d+m[\d.]+s|\d+s)/i)?.[1];
  if (exactMatch) return exactMatch;

  const minutesMatch = msg.match(/(\d+)\s*minutes?/i)?.[1];
  if (minutesMatch) return `${minutesMatch} minutes`;

  return "a few minutes";
};
