import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { resolveAssistantUsageWindow } from "../../billing/usage-cycle";
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

  it("reports consumed Pro allowances from the shared Durable Object meters", async () => {
    const anchor = new Date(Date.now() - 60_000);
    const user = await signupUser(
      `usage-pro-${crypto.randomUUID()}@test.com`,
      "Pro usage"
    );
    await env.DB.prepare(
      "UPDATE organization SET admin_tier_grant = 'pro', admin_tier_granted_at = ? WHERE id = ?"
    )
      .bind(anchor.getTime(), user.orgId)
      .run();
    const window = resolveAssistantUsageWindow(
      {
        source: "admin",
        billingInterval: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        usageCycleAnchor: anchor,
      },
      new Date()
    );
    if (!window) throw new Error("Expected active Pro usage window");
    const processor = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(user.orgId)
    );
    await runInDurableObject(processor, async (_instance, state) => {
      await state.storage.put(`counted-usage:aiSummaries:${window.id}`, {
        count: 2,
        settlements: [],
      });
      await state.storage.put(`counted-usage:externalCalls:${window.id}`, {
        count: 3,
        settlements: [],
      });
      await state.storage.put(`counted-usage:xEnrichments:${window.id}`, {
        count: 5,
        settlements: [],
      });
      await state.storage.put(`x-bookmark-usage:${window.id}`, { count: 4 });
    });
    await processor.settleChatSpend(window.id, "seed-usage", 250_000);

    const response = await SELF.fetch(
      `http://worker/api/usage?workspaceId=${user.orgId}`,
      { headers: { Cookie: user.cookie } }
    );

    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({
      items: expect.arrayContaining([
        {
          id: "aiSummaries",
          label: "AI summaries",
          limit: 1_000,
          remaining: 998,
        },
        {
          id: "assistant",
          label: "Cloudstash Assistant",
          limit: 1_000,
          remaining: 750,
        },
        {
          id: "externalCalls",
          label: "API and MCP calls",
          limit: 10_000,
          remaining: 9_997,
        },
        {
          id: "xBookmarks",
          label: "X bookmark sync",
          limit: 200,
          remaining: 196,
        },
        {
          id: "xEnrichments",
          label: "Enriched X summaries",
          limit: 100,
          remaining: 95,
        },
      ]),
      resetsAt: window.resetsAt,
    });
  });

  it("requires workspace authentication", async () => {
    const response = await SELF.fetch(
      `http://worker/api/usage?workspaceId=${crypto.randomUUID()}`
    );
    expect(response.status).toBe(401);
  });

  it("serializes concurrent external-call admission in one monthly counter", async () => {
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
