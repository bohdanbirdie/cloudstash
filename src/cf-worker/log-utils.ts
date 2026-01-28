/**
 * Generic logging utilities for privacy-safe logging.
 */

/**
 * Mask an ID for logging - shows first 8 chars only.
 */
export const maskId = (id: string): string => {
  if (id.length <= 8) return id;
  return `${id.slice(0, 8)}...`;
};

/**
 * Safe error info for logging - extracts type without potentially sensitive message.
 */
export const safeErrorInfo = (
  error: unknown
): { errorType: string; hasMessage: boolean } => {
  if (error instanceof Error) {
    return {
      errorType: error.name || "Error",
      hasMessage: !!error.message,
    };
  }
  return {
    errorType: typeof error,
    hasMessage: false,
  };
};
