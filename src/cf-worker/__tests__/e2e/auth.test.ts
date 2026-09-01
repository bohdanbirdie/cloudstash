import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

import { signupUser, makeAdmin } from "./helpers";
import type { UserInfo } from "./helpers";

describe("organization Auth E2E", () => {
  let userA: UserInfo;
  let userB: UserInfo;

  beforeAll(async () => {
    userA = await signupUser("user-a@test.com", "User A");
    userB = await signupUser("user-b@test.com", "User B");
  });

  describe("/api/auth/me", () => {
    it("returns 401 for unauthenticated request", async () => {
      const res = await SELF.fetch("http://worker/api/auth/me");
      expect(res.status).toBe(401);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });

    it("returns user data for authenticated request", async () => {
      const res = await SELF.fetch("http://worker/api/auth/me", {
        headers: { Cookie: userA.cookie },
      });
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        user: { id: string; name: string; email: string };
        session: { activeOrganizationId: string };
        organization: { id: string; name: string; slug: string } | null;
      };

      expect(data.user.id).toBe(userA.userId);
      expect(data.user.name).toBe("User A");
      expect(data.user.email).toBe("user-a@test.com");
      expect(data.session.activeOrganizationId).toBe(userA.orgId);
      expect(data.organization).not.toBeNull();
      expect(data.organization?.id).toBe(userA.orgId);
    });
  });

  describe("account identity", () => {
    it("persists a non-empty issuer for signup-created accounts", async () => {
      const account = await env.DB.prepare(
        "SELECT issuer FROM account WHERE user_id = ?"
      )
        .bind(userA.userId)
        .first<{ issuer: string | null }>();

      expect(account).toEqual({ issuer: expect.stringMatching(/\S/) });
    });
  });

  describe("personal workspace boundary", () => {
    it("rejects session-created organizations", async () => {
      const res = await SELF.fetch(
        "http://worker/api/auth/organization/create",
        {
          method: "POST",
          headers: {
            Cookie: userA.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "Allowance reset",
            slug: `allowance-reset-${crypto.randomUUID()}`,
          }),
        }
      );

      expect(res.status).toBe(403);
      const memberships = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM member WHERE user_id = ?"
      )
        .bind(userA.userId)
        .first<{ count: number }>();
      expect(memberships?.count).toBe(1);
    });

    it("rejects deletion of the personal organization", async () => {
      const res = await SELF.fetch(
        "http://worker/api/auth/organization/delete",
        {
          method: "POST",
          headers: {
            Cookie: userA.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ organizationId: userA.orgId }),
        }
      );

      expect(res.status).toBe(403);
      const organization = await env.DB.prepare(
        "SELECT id FROM organization WHERE id = ?"
      )
        .bind(userA.orgId)
        .first<{ id: string }>();
      expect(organization?.id).toBe(userA.orgId);
    });

    it("rejects invitations that could transfer the personal workspace", async () => {
      const res = await SELF.fetch(
        "http://worker/api/auth/organization/invite-member",
        {
          method: "POST",
          headers: {
            Cookie: userA.cookie,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: `workspace-transfer-${crypto.randomUUID()}@test.com`,
            role: "member",
            organizationId: userA.orgId,
          }),
        }
      );

      expect(res.status).toBe(403);
      const invitations = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM invitation WHERE organization_id = ?"
      )
        .bind(userA.orgId)
        .first<{ count: number }>();
      expect(invitations?.count).toBe(0);
    });
  });

  describe("/api/org/:id", () => {
    it("returns 401 for unauthenticated request", async () => {
      const res = await SELF.fetch(`http://worker/api/org/${userA.orgId}`);
      expect(res.status).toBe(401);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Unauthorized");
    });

    it("returns org data when user is a member", async () => {
      const res = await SELF.fetch(`http://worker/api/org/${userA.orgId}`, {
        headers: { Cookie: userA.cookie },
      });
      expect(res.status).toBe(200);

      const data = (await res.json()) as {
        id: string;
        name: string;
        slug: string;
        role: string;
      };

      expect(data.id).toBe(userA.orgId);
      expect(data.name).toBe("User A's Workspace");
      expect(data.role).toBe("owner");
    });

    it("returns 403 when user is not a member", async () => {
      const res = await SELF.fetch(`http://worker/api/org/${userB.orgId}`, {
        headers: { Cookie: userA.cookie },
      });
      expect(res.status).toBe(403);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Access denied");
    });

    it("returns 404 for non-existent org", async () => {
      const res = await SELF.fetch(
        "http://worker/api/org/non-existent-org-id",
        { headers: { Cookie: userA.cookie } }
      );
      expect(res.status).toBe(404);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Library not found");
    });
  });

  describe("cross-user isolation", () => {
    it("user A and User B have different organizations", () => {
      expect(userA.orgId).not.toBe(userB.orgId);
    });

    it("user B can access their own org", async () => {
      const res = await SELF.fetch(`http://worker/api/org/${userB.orgId}`, {
        headers: { Cookie: userB.cookie },
      });
      expect(res.status).toBe(200);

      const data = (await res.json()) as { name: string; role: string };
      expect(data.name).toBe("User B's Workspace");
      expect(data.role).toBe("owner");
    });

    it("user B cannot access User A org", async () => {
      const res = await SELF.fetch(`http://worker/api/org/${userA.orgId}`, {
        headers: { Cookie: userB.cookie },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("invite redeem flow", () => {
    let unapprovedUser: UserInfo;
    let inviteCode: string;

    beforeAll(async () => {
      // Create an unapproved user
      unapprovedUser = await signupUser(
        "unapproved@test.com",
        "Unapproved User"
      );
      await env.DB.prepare("UPDATE user SET approved = 0 WHERE id = ?")
        .bind(unapprovedUser.userId)
        .run();

      // Create an invite code (admin creates it)
      await makeAdmin(userA.userId);
      const createRes = await SELF.fetch("http://worker/api/invites", {
        method: "POST",
        headers: {
          Cookie: userA.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      expect(createRes.status).toBe(200);
      const invite = (await createRes.json()) as { code: string };
      inviteCode = invite.code;
    });

    it("redeem updates user and getSession with disableCookieCache returns approved:true", async () => {
      const res = await SELF.fetch("http://worker/api/invites/redeem", {
        method: "POST",
        headers: {
          Cookie: unapprovedUser.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code: inviteCode }),
      });
      expect(res.status).toBe(200);

      // Without disableCookieCache, the stale cookie would return approved:false
      // With disableCookieCache, it reads from DB and returns approved:true
      const meRes = await SELF.fetch(
        "http://worker/api/auth/get-session?disableCookieCache=true",
        { headers: { Cookie: unapprovedUser.cookie } }
      );
      expect(meRes.status).toBe(200);

      const session = (await meRes.json()) as {
        user: { approved: boolean };
      };
      expect(session.user.approved).toBe(true);

      // The response should include updated Set-Cookie to refresh the cache
      const setCookie = meRes.headers.get("set-cookie");
      expect(setCookie).toBeTruthy();
    });
  });
});
