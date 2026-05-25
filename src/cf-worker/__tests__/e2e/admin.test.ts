import { beforeAll, describe, expect, it } from "@effect/vitest";
import { env, SELF } from "cloudflare:test";

import { signupUser, makeAdmin } from "./helpers";
import type { UserInfo } from "./helpers";

let userSeq = 0;
const freshEmail = (label: string): string =>
  `${label}-${Date.now()}-${++userSeq}@test.com`;

describe("admin Endpoints E2E", () => {
  let adminUser: UserInfo;
  let regularUser: UserInfo;

  beforeAll(async () => {
    adminUser = await signupUser("admin-user@test.com", "Admin User");
    regularUser = await signupUser("regular-user@test.com", "Regular User");
    await makeAdmin(adminUser.userId);
  });

  describe("GET /api/admin/workspaces", () => {
    it("returns 401 for unauthenticated request", async () => {
      const res = await SELF.fetch("http://worker/api/admin/workspaces");
      expect(res.status).toBe(401);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 403 for non-admin user", async () => {
      const res = await SELF.fetch("http://worker/api/admin/workspaces", {
        headers: { Cookie: regularUser.cookie },
      });
      expect(res.status).toBe(403);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Admin access required");
    });

    it("returns workspace list for admin user", async () => {
      const res = await SELF.fetch("http://worker/api/admin/workspaces", {
        headers: { Cookie: adminUser.cookie },
      });
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        workspaces: Array<{
          id: string;
          name: string;
          slug: string | null;
          creatorEmail: string | null;
          tier: "free" | "plus" | "pro";
          tierSource: "stripe" | "admin";
          overrides: Record<string, unknown>;
          capabilities: Record<string, unknown>;
        }>;
      };

      expect(data.workspaces).toBeInstanceOf(Array);
      expect(data.workspaces.length).toBeGreaterThanOrEqual(2);

      const adminWorkspace = data.workspaces.find(
        (w) => w.id === adminUser.orgId
      );
      const regularWorkspace = data.workspaces.find(
        (w) => w.id === regularUser.orgId
      );

      expect(adminWorkspace).toBeDefined();
      expect(adminWorkspace?.creatorEmail).toBe("admin-user@test.com");
      expect(adminWorkspace?.tier).toBe("free");
      expect(adminWorkspace?.overrides).toEqual({});
      expect(adminWorkspace?.capabilities).toBeDefined();

      expect(regularWorkspace).toBeDefined();
      expect(regularWorkspace?.creatorEmail).toBe("regular-user@test.com");
    });
  });

  describe("GET /api/org/:id/settings", () => {
    it("returns 401 for unauthenticated request", async () => {
      const res = await SELF.fetch(
        `http://worker/api/org/${adminUser.orgId}/settings`
      );
      expect(res.status).toBe(401);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 403 for non-admin user", async () => {
      const res = await SELF.fetch(
        `http://worker/api/org/${regularUser.orgId}/settings`,
        { headers: { Cookie: regularUser.cookie } }
      );
      expect(res.status).toBe(403);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Admin access required");
    });

    it("returns 404 for non-existent org", async () => {
      const res = await SELF.fetch(
        "http://worker/api/org/non-existent-org-id/settings",
        { headers: { Cookie: adminUser.cookie } }
      );
      expect(res.status).toBe(404);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Organization not found");
    });

    it("returns settings for admin user", async () => {
      const res = await SELF.fetch(
        `http://worker/api/org/${adminUser.orgId}/settings`,
        { headers: { Cookie: adminUser.cookie } }
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        tier: "free" | "plus" | "pro";
        overrides: Record<string, unknown>;
        capabilities: Record<string, unknown>;
      };

      expect(data.tier).toBe("free");
      expect(data.overrides).toEqual({});
      expect(data.capabilities).toBeDefined();
    });
  });

  describe("PUT /api/org/:id/tier", () => {
    it("returns 401 for unauthenticated request", async () => {
      const res = await SELF.fetch(
        `http://worker/api/org/${adminUser.orgId}/tier`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tier: "pro" }),
        }
      );
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-admin user", async () => {
      const res = await SELF.fetch(
        `http://worker/api/org/${regularUser.orgId}/tier`,
        {
          method: "PUT",
          headers: {
            Cookie: regularUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tier: "pro" }),
        }
      );
      expect(res.status).toBe(403);
    });

    it("rejects invalid tier values", async () => {
      const res = await SELF.fetch(
        `http://worker/api/org/${regularUser.orgId}/tier`,
        {
          method: "PUT",
          headers: {
            Cookie: adminUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tier: "ultra" }),
        }
      );
      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent org", async () => {
      const res = await SELF.fetch(
        "http://worker/api/org/non-existent-org-id/tier",
        {
          method: "PUT",
          headers: {
            Cookie: adminUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tier: "plus" }),
        }
      );
      expect(res.status).toBe(404);
    });

    it("sets tier and flips tierSource to admin", async () => {
      // Fresh user → fresh org, so this test owns its mutations.
      const target = await signupUser(freshEmail("tier-mut"), "Tier Mut");

      const setRes = await SELF.fetch(
        `http://worker/api/org/${target.orgId}/tier`,
        {
          method: "PUT",
          headers: {
            Cookie: adminUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tier: "pro" }),
        }
      );
      expect(setRes.status).toBe(200);

      const row = await env.DB.prepare(
        "SELECT tier, tier_source FROM organization WHERE id = ?"
      )
        .bind(target.orgId)
        .first<{ tier: string; tier_source: string }>();
      expect(row?.tier).toBe("pro");
      expect(row?.tier_source).toBe("admin");
    });

    it("admin re-set on same tier still flips tierSource from stripe to admin", async () => {
      // Simulates the post-Stripe-sync case: an admin grants tier=pro to a
      // workspace already on pro via Stripe; the override must survive the
      // next Stripe sync, so tierSource has to move to "admin".
      const target = await signupUser(freshEmail("same-tier"), "Same Tier");
      await env.DB.prepare(
        "UPDATE organization SET tier = 'pro', tier_source = 'stripe' WHERE id = ?"
      )
        .bind(target.orgId)
        .run();

      const res = await SELF.fetch(
        `http://worker/api/org/${target.orgId}/tier`,
        {
          method: "PUT",
          headers: {
            Cookie: adminUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tier: "pro" }),
        }
      );
      expect(res.status).toBe(200);

      const row = await env.DB.prepare(
        "SELECT tier, tier_source FROM organization WHERE id = ?"
      )
        .bind(target.orgId)
        .first<{ tier: string; tier_source: string }>();
      expect(row?.tier).toBe("pro");
      expect(row?.tier_source).toBe("admin");
    });
  });

  describe("PUT /api/org/:id/overrides", () => {
    it("rejects unknown capability keys", async () => {
      const res = await SELF.fetch(
        `http://worker/api/org/${regularUser.orgId}/overrides`,
        {
          method: "PUT",
          headers: {
            Cookie: adminUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ key: "nope", value: true }),
        }
      );
      expect(res.status).toBe(400);
    });

    // Sweep boolean caps so a regression in the per-key allow-list (e.g.
    // dropping xBookmarkSync from CAPABILITY_KEYS) fails loudly.
    const BOOLEAN_OVERRIDE_CASES = [
      { key: "aiSummary", tierDefault: false },
      { key: "xBookmarkSync", tierDefault: false },
      { key: "xContentEnrichment", tierDefault: false },
      { key: "publicApi", tierDefault: false },
    ] as const;

    for (const { key, tierDefault } of BOOLEAN_OVERRIDE_CASES) {
      it(`sets and clears the ${key} override`, async () => {
        const target = await signupUser(
          freshEmail(`override-mut-${key}`),
          `Override ${key}`
        );

        const setRes = await SELF.fetch(
          `http://worker/api/org/${target.orgId}/overrides`,
          {
            method: "PUT",
            headers: {
              Cookie: adminUser.cookie,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ key, value: true }),
          }
        );
        expect(setRes.status).toBe(200);

        const getRes = await SELF.fetch(
          `http://worker/api/org/${target.orgId}/settings`,
          { headers: { Cookie: adminUser.cookie } }
        );
        const getData = (await getRes.json()) as {
          overrides: Record<string, unknown>;
          capabilities: Record<string, unknown>;
        };
        expect(getData.overrides[key]).toBe(true);
        expect(getData.capabilities[key]).toBe(true);

        const clearRes = await SELF.fetch(
          `http://worker/api/org/${target.orgId}/overrides`,
          {
            method: "PUT",
            headers: {
              Cookie: adminUser.cookie,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ key, value: null }),
          }
        );
        expect(clearRes.status).toBe(200);

        const afterRes = await SELF.fetch(
          `http://worker/api/org/${target.orgId}/settings`,
          { headers: { Cookie: adminUser.cookie } }
        );
        const afterData = (await afterRes.json()) as {
          overrides: Record<string, unknown>;
          capabilities: Record<string, unknown>;
        };
        expect(afterData.overrides[key]).toBeUndefined();
        expect(afterData.capabilities[key]).toBe(tierDefault);
      });
    }

    it("rejects boolean caps with a number value (per-key schema enforced)", async () => {
      const target = await signupUser(
        freshEmail("override-type-mismatch"),
        "Type Mismatch"
      );

      const res = await SELF.fetch(
        `http://worker/api/org/${target.orgId}/overrides`,
        {
          method: "PUT",
          headers: {
            Cookie: adminUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ key: "aiSummary", value: 42 }),
        }
      );
      expect(res.status).toBe(400);
    });

    it("rejects number caps with a boolean value (per-key schema enforced)", async () => {
      const target = await signupUser(
        freshEmail("override-budget-mismatch"),
        "Budget Mismatch"
      );

      const res = await SELF.fetch(
        `http://worker/api/org/${target.orgId}/overrides`,
        {
          method: "PUT",
          headers: {
            Cookie: adminUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ key: "monthlyChatBudgetUsd", value: true }),
        }
      );
      expect(res.status).toBe(400);
    });

    it("listWithOwners merges per-org overrides into capabilities", async () => {
      // Verifies the merge contract surfaced through the admin listing:
      // an override on a single key must coexist with the rest of the tier
      // defaults rather than replacing the whole capability object.
      const target = await signupUser(freshEmail("merge"), "Merge Test");

      const setRes = await SELF.fetch(
        `http://worker/api/org/${target.orgId}/overrides`,
        {
          method: "PUT",
          headers: {
            Cookie: adminUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ key: "aiSummary", value: true }),
        }
      );
      expect(setRes.status).toBe(200);

      const listRes = await SELF.fetch("http://worker/api/admin/workspaces", {
        headers: { Cookie: adminUser.cookie },
      });
      const listData = (await listRes.json()) as {
        workspaces: Array<{
          id: string;
          tier: string;
          overrides: Record<string, unknown>;
          capabilities: {
            aiSummary: boolean;
            chatAgent: boolean;
          };
        }>;
      };

      const ws = listData.workspaces.find((w) => w.id === target.orgId);
      expect(ws).toBeDefined();
      expect(ws?.overrides).toEqual({ aiSummary: true });
      // free tier defaults preserved, with aiSummary override applied on top.
      expect(ws?.tier).toBe("free");
      expect(ws?.capabilities.aiSummary).toBe(true);
      expect(ws?.capabilities.chatAgent).toBe(false);
    });
  });

  describe("POST /api/admin/users/:id/approve", () => {
    let unapprovedUser: UserInfo;

    beforeAll(async () => {
      unapprovedUser = await signupUser(
        "unapproved-user@test.com",
        "Unapproved User"
      );
      await env.DB.prepare("UPDATE user SET approved = 0 WHERE id = ?")
        .bind(unapprovedUser.userId)
        .run();
    });

    it("returns 401 for unauthenticated request", async () => {
      const res = await SELF.fetch(
        `http://worker/api/admin/users/${unapprovedUser.userId}/approve`,
        { method: "POST" }
      );
      expect(res.status).toBe(401);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 403 for non-admin user", async () => {
      const res = await SELF.fetch(
        `http://worker/api/admin/users/${unapprovedUser.userId}/approve`,
        {
          method: "POST",
          headers: { Cookie: regularUser.cookie },
        }
      );
      expect(res.status).toBe(403);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Admin access required");
    });

    it("returns 404 for non-existent user", async () => {
      const res = await SELF.fetch(
        "http://worker/api/admin/users/non-existent-user-id/approve",
        {
          method: "POST",
          headers: { Cookie: adminUser.cookie },
        }
      );
      expect(res.status).toBe(404);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("User not found");
    });

    it("approves user successfully", async () => {
      const target = await signupUser(
        freshEmail("approve-success"),
        "Approve Success"
      );
      await env.DB.prepare("UPDATE user SET approved = 0 WHERE id = ?")
        .bind(target.userId)
        .run();

      const beforeApproval = await env.DB.prepare(
        "SELECT approved FROM user WHERE id = ?"
      )
        .bind(target.userId)
        .first<{ approved: number }>();
      expect(beforeApproval?.approved).toBe(0);

      const res = await SELF.fetch(
        `http://worker/api/admin/users/${target.userId}/approve`,
        {
          method: "POST",
          headers: { Cookie: adminUser.cookie },
        }
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as { success: boolean };
      expect(data.success).toBe(true);

      const afterApproval = await env.DB.prepare(
        "SELECT approved FROM user WHERE id = ?"
      )
        .bind(target.userId)
        .first<{ approved: number }>();
      expect(afterApproval?.approved).toBe(1);
    });

    it("handles already-approved user", async () => {
      const target = await signupUser(
        freshEmail("already-approved"),
        "Already Approved"
      );
      await env.DB.prepare("UPDATE user SET approved = 1 WHERE id = ?")
        .bind(target.userId)
        .run();

      const res = await SELF.fetch(
        `http://worker/api/admin/users/${target.userId}/approve`,
        {
          method: "POST",
          headers: { Cookie: adminUser.cookie },
        }
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        success: boolean;
        alreadyApproved: boolean;
      };
      expect(data.success).toBe(true);
      expect(data.alreadyApproved).toBe(true);
    });
  });
});
