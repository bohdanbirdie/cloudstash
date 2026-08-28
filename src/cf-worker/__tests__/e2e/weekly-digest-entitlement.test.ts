import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { makeAdmin, signupUser } from "./helpers";

describe("Weekly digest entitlement reconciliation", () => {
  it("arms a paid workspace even when its LinkProcessor has not run yet", async () => {
    const user = await signupUser(
      `digest-entitlement-${crypto.randomUUID()}@test.com`,
      "Digest Entitlement"
    );
    await makeAdmin(user.userId);

    const response = await SELF.fetch(
      `http://worker/api/org/${user.orgId}/tier`,
      {
        body: JSON.stringify({ tier: "pro" }),
        headers: {
          Cookie: user.cookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      }
    );
    expect(response.status).toBe(200);

    const owner = env.LIBRARY_DO.get(env.LIBRARY_DO.idFromName(user.orgId));
    const state = await runInDurableObject(owner, async (_instance, ctx) => ({
      alarm: await ctx.storage.getAlarm(),
      storeId: await ctx.storage.get<string>("storeId"),
    }));

    expect(state.storeId).toBe(user.orgId);
    expect(state.alarm).not.toBeNull();

    const disable = await SELF.fetch(
      `http://worker/api/org/${user.orgId}/overrides`,
      {
        body: JSON.stringify({ key: "weeklyDigest", value: false }),
        headers: {
          Cookie: user.cookie,
          "Content-Type": "application/json",
        },
        method: "PUT",
      }
    );
    expect(disable.status).toBe(200);
    expect(
      await runInDurableObject(owner, async (_instance, ctx) =>
        ctx.storage.getAlarm()
      )
    ).toBeNull();
  });
});
