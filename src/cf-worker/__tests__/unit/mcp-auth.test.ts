import { describe, expect, it } from "vitest";

import { tokenTargetsMcp } from "../../mcp/auth";

const expected = {
  issuer: "https://cloudstash.test/api/auth",
  resource: "https://cloudstash.test/mcp",
};

describe("MCP access-token target validation", () => {
  it("accepts only the configured issuer and a matching string audience", () => {
    expect(
      tokenTargetsMcp(
        {
          aud: "https://cloudstash.test/mcp",
          iss: "https://cloudstash.test/api/auth",
        },
        expected
      )
    ).toBe(true);
    expect(
      tokenTargetsMcp(
        {
          aud: "https://cloudstash.test/other",
          iss: "https://cloudstash.test/api/auth",
        },
        expected
      )
    ).toBe(false);
    expect(
      tokenTargetsMcp(
        {
          aud: "https://cloudstash.test/mcp",
          iss: "https://issuer.example/api/auth",
        },
        expected
      )
    ).toBe(false);
  });

  it("accepts the configured resource in a multi-audience token", () => {
    expect(
      tokenTargetsMcp(
        {
          aud: ["https://cloudstash.test/other", "https://cloudstash.test/mcp"],
          iss: "https://cloudstash.test/api/auth",
        },
        expected
      )
    ).toBe(true);
  });
});
