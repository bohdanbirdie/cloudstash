import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { OrgId } from "../../db/branded";
import { signupUser } from "./helpers";

describe("workspace counted usage", () => {
  it("shows the Free plan's bounded summary allowance", async () => {
    const user = await signupUser(
      `usage-${crypto.randomUUID()}@test.com`,
      "Usage User"
    );
    const response = await SELF.fetch(
      `http://worker/api/usage?workspaceId=${user.orgId}`,
      { headers: { Cookie: user.cookie } }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [
        {
          id: "aiSummaries",
          label: "AI summaries",
          limit: 10,
          remaining: 10,
        },
      ],
      resetsAt: expect.any(String),
    });
  });

  it("serializes API and MCP admission in one monthly counter", async () => {
    const orgId = OrgId.make(`counted-usage-${crypto.randomUUID()}`);
    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(orgId)
    );
    const windowId = "2026-08-window";

    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () =>
        processor.reserveExternalCall(windowId, 5)
      )
    );

    expect(
      outcomes.filter((outcome) => outcome.status === "reserved")
    ).toHaveLength(5);
    expect(
      outcomes.filter((outcome) => outcome.status === "limit_reached")
    ).toHaveLength(7);
    expect(await processor.getCountedUsage(windowId)).toMatchObject({
      externalCalls: 5,
    });
    expect(await processor.getCountedUsage("next-window")).toEqual({
      aiSummaries: 0,
      externalCalls: 0,
      xEnrichments: 0,
    });
  });
});
