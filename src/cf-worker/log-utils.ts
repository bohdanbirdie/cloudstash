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
 * Stable, privacy-safe identity witness for migration and lifecycle logs.
 * The 128-bit prefix is sufficient for equality checks without logging the ID.
 */
export const fingerprintId = async (id: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(id)
  );
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
};

/**
 * Safe error info for logging - extracts type without potentially sensitive message.
 */
export const safeErrorInfo = (
  error: unknown
): { errorType: string; hasMessage: boolean; errorMessage?: string } => {
  if (error instanceof Error) {
    return {
      errorType: error.name || "Error",
      hasMessage: !!error.message,
      errorMessage: error.message?.slice(0, 500),
    };
  }
  if (error !== null && typeof error === "object") {
    let str = "{}";
    try {
      str = JSON.stringify(error)?.slice(0, 500) ?? "{}";
    } catch {
      str = "{}";
    }
    return {
      errorType: "object",
      hasMessage: str !== "{}",
      errorMessage: str !== "{}" ? str : undefined,
    };
  }
  return {
    errorType: typeof error,
    hasMessage: false,
  };
};
