import { SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

/**
 * E2E tests for organization-based auth using Cloudflare Workers Vitest pool.
 *
 * Uses email/password signup (enabled via ENABLE_TEST_AUTH=true) to create test users.
 * This triggers databaseHooks to automatically create personal organizations.
 */

interface UserInfo {
  cookie: string;
  userId: string;
  orgId: string;
}

/**
 * Helper to signup a user and get their session info
 */
const signupUser = async (email: string, name: string): Promise<UserInfo> => {
  const res = await SELF.fetch("http://worker/api/auth/sign-up/email", {
    body: JSON.stringify({ email, name, password: "test-password-123" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Signup failed: ${res.status} - ${text}`);
  }

  const cookie = res.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("No session cookie returned from signup");
  }

  // Get user info including orgId via /me endpoint
  const meRes = await SELF.fetch("http://worker/api/auth/me", {
    headers: { Cookie: cookie },
  });

  if (!meRes.ok) {
    const text = await meRes.text();
    throw new Error(`Failed to get /me: ${meRes.status} - ${text}`);
  }

  const me = (await meRes.json()) as {
    user: { id: string };
    session: { activeOrganizationId: string };
  };

  return {
    cookie,
    orgId: me.session.activeOrganizationId,
    userId: me.user.id,
  };
};

describe("organization Auth E2E", () => {
  let userA: UserInfo;
  let userB: UserInfo;

  beforeAll(async () => {
    // Create two users via email signup (triggers databaseHooks → auto-creates orgs)
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
      // User A tries to access User B's organization
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
        {
          headers: { Cookie: userA.cookie },
        }
      );
      expect(res.status).toBe(404);

      const data = (await res.json()) as { error: string };
      expect(data.error).toBe("Organization not found");
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
});
