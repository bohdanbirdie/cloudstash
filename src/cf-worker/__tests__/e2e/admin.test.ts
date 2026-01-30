import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

import { signupUser, makeAdmin, type UserInfo } from "./helpers";

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
          features: { aiSummary?: boolean };
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
      expect(adminWorkspace?.features).toEqual({});

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

    it("returns features for admin user", async () => {
      const res = await SELF.fetch(
        `http://worker/api/org/${adminUser.orgId}/settings`,
        { headers: { Cookie: adminUser.cookie } }
      );
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        features: { aiSummary?: boolean };
      };

      expect(data.features).toEqual({});
    });
  });

  describe("PUT /api/org/:id/settings", () => {
    it("returns 401 for unauthenticated request", async () => {
      const res = await SELF.fetch(
        `http://worker/api/org/${adminUser.orgId}/settings`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ features: { aiSummary: true } }),
        }
      );
      expect(res.status).toBe(401);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });

    it("returns 403 for non-admin user", async () => {
      const res = await SELF.fetch(
        `http://worker/api/org/${regularUser.orgId}/settings`,
        {
          method: "PUT",
          headers: {
            Cookie: regularUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ features: { aiSummary: true } }),
        }
      );
      expect(res.status).toBe(403);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Admin access required");
    });

    it("returns 404 for non-existent org", async () => {
      const res = await SELF.fetch(
        "http://worker/api/org/non-existent-org-id/settings",
        {
          method: "PUT",
          headers: {
            Cookie: adminUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ features: { aiSummary: true } }),
        }
      );
      expect(res.status).toBe(404);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Organization not found");
    });

    it("updates features for admin user", async () => {
      const enableRes = await SELF.fetch(
        `http://worker/api/org/${regularUser.orgId}/settings`,
        {
          method: "PUT",
          headers: {
            Cookie: adminUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ features: { aiSummary: true } }),
        }
      );
      expect(enableRes.status).toBe(200);

      const enableData = (await enableRes.json()) as {
        success: boolean;
        features: { aiSummary?: boolean };
      };
      expect(enableData.success).toBe(true);
      expect(enableData.features.aiSummary).toBe(true);

      const getRes = await SELF.fetch(
        `http://worker/api/org/${regularUser.orgId}/settings`,
        { headers: { Cookie: adminUser.cookie } }
      );
      expect(getRes.status).toBe(200);

      const getData = (await getRes.json()) as {
        features: { aiSummary?: boolean };
      };
      expect(getData.features.aiSummary).toBe(true);

      const disableRes = await SELF.fetch(
        `http://worker/api/org/${regularUser.orgId}/settings`,
        {
          method: "PUT",
          headers: {
            Cookie: adminUser.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ features: { aiSummary: false } }),
        }
      );
      expect(disableRes.status).toBe(200);

      const disableData = (await disableRes.json()) as {
        success: boolean;
        features: { aiSummary?: boolean };
      };
      expect(disableData.success).toBe(true);
      expect(disableData.features.aiSummary).toBe(false);
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
      // Ensure user is unapproved before test
      await env.DB.prepare("UPDATE user SET approved = 0 WHERE id = ?")
        .bind(unapprovedUser.userId)
        .run();

      const beforeApproval = await env.DB.prepare(
        "SELECT approved FROM user WHERE id = ?"
      )
        .bind(unapprovedUser.userId)
        .first<{ approved: number }>();
      expect(beforeApproval?.approved).toBe(0);

      const res = await SELF.fetch(
        `http://worker/api/admin/users/${unapprovedUser.userId}/approve`,
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
        .bind(unapprovedUser.userId)
        .first<{ approved: number }>();
      expect(afterApproval?.approved).toBe(1);
    });

    it("handles already-approved user", async () => {
      // Ensure user is approved before test
      await env.DB.prepare("UPDATE user SET approved = 1 WHERE id = ?")
        .bind(unapprovedUser.userId)
        .run();

      const res = await SELF.fetch(
        `http://worker/api/admin/users/${unapprovedUser.userId}/approve`,
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
