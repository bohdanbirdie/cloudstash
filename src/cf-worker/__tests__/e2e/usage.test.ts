import { SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

import { signupUser, makeAdmin, type UserInfo } from "./helpers";

describe("GET /api/admin/usage", () => {
  let adminUser: UserInfo;
  let regularUser: UserInfo;

  beforeAll(async () => {
    adminUser = await signupUser("usage-admin@test.com", "Usage Admin");
    regularUser = await signupUser("usage-regular@test.com", "Usage Regular");
    await makeAdmin(adminUser.userId);
  });

  it("returns 401 for unauthenticated request", async () => {
    const res = await SELF.fetch("http://worker/api/admin/usage?period=24h");
    expect(res.status).toBe(401);

    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 for non-admin user", async () => {
    const res = await SELF.fetch("http://worker/api/admin/usage?period=24h", {
      headers: { Cookie: regularUser.cookie },
    });
    expect(res.status).toBe(403);

    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Admin access required");
  });

  it("returns 400 for invalid period", async () => {
    const res = await SELF.fetch("http://worker/api/admin/usage?period=1y", {
      headers: { Cookie: adminUser.cookie },
    });
    expect(res.status).toBe(400);

    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("Invalid period");
  });

  it("defaults period to 24h when not specified", async () => {
    // Without CF_ACCOUNT_ID/CF_ANALYTICS_TOKEN, queryUsage will fail,
    // but we can verify it doesn't return 400 (period validation passes)
    const res = await SELF.fetch("http://worker/api/admin/usage", {
      headers: { Cookie: adminUser.cookie },
    });

    // Will be 500 because CF_ACCOUNT_ID/CF_ANALYTICS_TOKEN aren't set in test env
    // but NOT 400 — which means period defaulted to "24h" and passed validation
    expect(res.status).not.toBe(400);
  });
});
