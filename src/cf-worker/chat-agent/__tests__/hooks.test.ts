import { describe, expect, it } from "vitest";

import type { Env } from "../../shared";
import { agentHooks } from "../hooks";

describe("agentHooks (unknown party fail-closed)", () => {
  // The hook's layer chain materializes Better Auth even on the early-return
  // path — populate the env fields it touches at construction time so the
  // test output stays clean.
  const stubEnv = {
    BETTER_AUTH_URL: "http://localhost",
    BETTER_AUTH_SECRET: "test-secret-for-tests-only-32-chars-long",
    DB: {} as never,
  } as unknown as Env;
  const request = new Request("https://example.com/agents/whatever");

  it.each(["unknown", "summary", "research", ""])(
    "rejects party '%s' with 404 and never reaches auth",
    async (party) => {
      const response = await agentHooks.onBeforeConnect(
        request,
        { party, name: "any-org" },
        stubEnv
      );
      expect(response).toBeInstanceOf(Response);
      expect(response?.status).toBe(404);

      const body = await response!.json();
      expect(body).toMatchObject({
        _tag: "UnknownAgentPartyError",
        message: "Unknown agent",
        party,
      });
    }
  );

  it("uses the same handler for onBeforeRequest", async () => {
    const response = await agentHooks.onBeforeRequest(
      request,
      { party: "unknown", name: "any-org" },
      stubEnv
    );
    expect(response?.status).toBe(404);
  });
});
