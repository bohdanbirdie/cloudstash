import { describe, it, expect } from "vitest";

import {
  isRateLimitError,
  isCreditLimitError,
  extractRetryTime,
} from "../../chat-agent/errors";

describe("isRateLimitError", () => {
  describe("status code detection", () => {
    it("returns true for statusCode 429", () => {
      expect(isRateLimitError({ statusCode: 429 })).toBe(true);
    });

    it("returns true for lastError.statusCode 429", () => {
      expect(isRateLimitError({ lastError: { statusCode: 429 } })).toBe(true);
    });

    it("returns false for other status codes", () => {
      expect(isRateLimitError({ statusCode: 400 })).toBe(false);
      expect(isRateLimitError({ statusCode: 500 })).toBe(false);
      expect(isRateLimitError({ statusCode: 200 })).toBe(false);
    });
  });

  describe("message detection", () => {
    it("returns true for message containing 'rate limit'", () => {
      expect(isRateLimitError({ message: "Rate limit exceeded" })).toBe(true);
    });

    it("returns true for case-insensitive 'rate limit'", () => {
      expect(isRateLimitError({ message: "RATE LIMIT reached" })).toBe(true);
      expect(isRateLimitError({ message: "Rate Limit error" })).toBe(true);
    });

    it("returns true for 'rate limit' anywhere in message", () => {
      expect(
        isRateLimitError({ message: "Error: rate limit exceeded, try again" })
      ).toBe(true);
    });

    it("returns false for messages without 'rate limit'", () => {
      expect(isRateLimitError({ message: "Some other error" })).toBe(false);
      expect(isRateLimitError({ message: "Limit reached" })).toBe(false);
    });
  });

  describe("combined conditions", () => {
    it("returns true when both status and message match", () => {
      expect(
        isRateLimitError({ statusCode: 429, message: "Rate limit exceeded" })
      ).toBe(true);
    });

    it("returns true when only status matches", () => {
      expect(isRateLimitError({ statusCode: 429, message: "Unknown error" })).toBe(
        true
      );
    });

    it("returns true when only message matches", () => {
      expect(
        isRateLimitError({ statusCode: 500, message: "rate limit reached" })
      ).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns false for null", () => {
      expect(isRateLimitError(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isRateLimitError(undefined)).toBe(false);
    });

    it("returns false for string", () => {
      expect(isRateLimitError("rate limit")).toBe(false);
    });

    it("returns false for number", () => {
      expect(isRateLimitError(429)).toBe(false);
    });

    it("returns false for empty object", () => {
      expect(isRateLimitError({})).toBe(false);
    });

    it("returns false for array", () => {
      expect(isRateLimitError([429])).toBe(false);
    });
  });
});

describe("isCreditLimitError", () => {
  describe("status code detection", () => {
    it("returns true for statusCode 402", () => {
      expect(isCreditLimitError({ statusCode: 402 })).toBe(true);
    });

    it("returns true for lastError.statusCode 402", () => {
      expect(isCreditLimitError({ lastError: { statusCode: 402 } })).toBe(true);
    });

    it("returns false for other status codes", () => {
      expect(isCreditLimitError({ statusCode: 400 })).toBe(false);
      expect(isCreditLimitError({ statusCode: 429 })).toBe(false);
      expect(isCreditLimitError({ statusCode: 500 })).toBe(false);
    });
  });

  describe("message detection", () => {
    it("returns true for 'insufficient credits'", () => {
      expect(isCreditLimitError({ message: "Insufficient credits" })).toBe(true);
    });

    it("returns true for 'credit limit'", () => {
      expect(isCreditLimitError({ message: "Credit limit reached" })).toBe(true);
    });

    it("returns true for case-insensitive matching", () => {
      expect(isCreditLimitError({ message: "INSUFFICIENT CREDITS" })).toBe(true);
      expect(isCreditLimitError({ message: "CREDIT LIMIT exceeded" })).toBe(true);
    });

    it("returns true for message containing credit phrases", () => {
      expect(
        isCreditLimitError({
          message: "Error: insufficient credits on your account",
        })
      ).toBe(true);
    });

    it("returns false for unrelated messages", () => {
      expect(isCreditLimitError({ message: "Rate limit exceeded" })).toBe(false);
      expect(isCreditLimitError({ message: "Unknown error" })).toBe(false);
    });
  });

  describe("combined conditions", () => {
    it("returns true when both status and message match", () => {
      expect(
        isCreditLimitError({ statusCode: 402, message: "Insufficient credits" })
      ).toBe(true);
    });

    it("returns true when only status matches", () => {
      expect(
        isCreditLimitError({ statusCode: 402, message: "Payment required" })
      ).toBe(true);
    });

    it("returns true when only message matches", () => {
      expect(
        isCreditLimitError({ statusCode: 500, message: "credit limit reached" })
      ).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("returns false for null", () => {
      expect(isCreditLimitError(null)).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isCreditLimitError(undefined)).toBe(false);
    });

    it("returns false for string", () => {
      expect(isCreditLimitError("credit limit")).toBe(false);
    });

    it("returns false for number", () => {
      expect(isCreditLimitError(402)).toBe(false);
    });

    it("returns false for empty object", () => {
      expect(isCreditLimitError({})).toBe(false);
    });
  });
});

describe("extractRetryTime", () => {
  describe("exact format matching", () => {
    it("extracts 'Xm Xs' format", () => {
      expect(extractRetryTime({ message: "try again in 2m30s" })).toBe("2m30s");
    });

    it("extracts 'Xs' format", () => {
      expect(extractRetryTime({ message: "try again in 45s" })).toBe("45s");
    });

    it("extracts with decimal seconds", () => {
      expect(extractRetryTime({ message: "try again in 1m30.5s" })).toBe(
        "1m30.5s"
      );
    });

    it("is case-insensitive", () => {
      expect(extractRetryTime({ message: "Try Again In 5m30s" })).toBe("5m30s");
    });

    it("extracts from longer message", () => {
      expect(
        extractRetryTime({
          message: "Rate limit exceeded. Please try again in 3m20s to continue.",
        })
      ).toBe("3m20s");
    });
  });

  describe("minutes format", () => {
    it("extracts 'X minutes'", () => {
      expect(extractRetryTime({ message: "wait 5 minutes" })).toBe("5 minutes");
    });

    it("extracts 'X minute' (singular)", () => {
      expect(extractRetryTime({ message: "try in 1 minute" })).toBe("1 minutes");
    });

    it("is case-insensitive for minutes", () => {
      expect(extractRetryTime({ message: "Wait 10 MINUTES" })).toBe("10 minutes");
    });
  });

  describe("fallback behavior", () => {
    it("returns 'a few minutes' when no pattern matches", () => {
      expect(extractRetryTime({ message: "Unknown error occurred" })).toBe(
        "a few minutes"
      );
    });

    it("returns 'a few minutes' for empty message", () => {
      expect(extractRetryTime({ message: "" })).toBe("a few minutes");
    });

    it("returns 'a few minutes' for null-ish input", () => {
      expect(extractRetryTime(null)).toBe("a few minutes");
      expect(extractRetryTime(undefined)).toBe("a few minutes");
    });
  });

  describe("input handling", () => {
    it("handles plain string error", () => {
      expect(extractRetryTime("try again in 30s")).toBe("30s");
    });

    it("handles number input", () => {
      expect(extractRetryTime(12345)).toBe("a few minutes");
    });

    it("handles object without message", () => {
      expect(extractRetryTime({ statusCode: 429 })).toBe("a few minutes");
    });

    it("converts non-string message to string", () => {
      expect(extractRetryTime({ message: 123 })).toBe("a few minutes");
    });
  });

  describe("priority", () => {
    it("prefers exact format over minutes format", () => {
      // "try again in 2m30s" should match before "5 minutes"
      expect(
        extractRetryTime({ message: "try again in 2m30s or wait 5 minutes" })
      ).toBe("2m30s");
    });
  });
});
