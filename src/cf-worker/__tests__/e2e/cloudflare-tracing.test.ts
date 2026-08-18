import { tracing } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("Cloudflare custom tracing runtime", () => {
  it("supports the manual-lifetime span API required by the Agents SDK", () => {
    expect(typeof tracing.startActiveSpan).toBe("function");

    const result = tracing.startActiveSpan("cloudstash.test", (span) => {
      span.setAttribute("cloudstash.test", true);
      span.end();
      return "completed";
    });

    expect(result).toBe("completed");
  });
});
