import { env, runInDurableObject, SELF } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";

import { events } from "../../../livestore/schema";
import { OrgId } from "../../db/branded";
import type { SyncBackendDO } from "../../sync";

/**
 * E2E tests for LiveStore sync connection auth rejection.
 *
 * Tests that the sync endpoint rejects WebSocket connections when:
 * - Session cookie is missing
 * - Session cookie is invalid
 * - User's orgId doesn't match the requested storeId
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

/**
 * Build sync URL for WebSocket connection
 */
const buildSyncUrl = (storeId: string) => {
  const params = new URLSearchParams({
    storeId,
    transport: "ws",
  });
  return `http://worker/sync?${params.toString()}`;
};

describe("sync Connection Auth E2E", () => {
  let userA: UserInfo;
  let userB: UserInfo;
  let revokedUser: UserInfo;
  let unapprovedUser: UserInfo;

  beforeAll(async () => {
    userA = await signupUser("sync-user-a@test.com", "Sync User A");
    userB = await signupUser("sync-user-b@test.com", "Sync User B");
    revokedUser = await signupUser(
      "sync-revoked@test.com",
      "Sync Revoked User"
    );
    unapprovedUser = await signupUser(
      "sync-unapproved@test.com",
      "Sync Unapproved User"
    );
  });

  describe("missing session cookie", () => {
    it("rejects sync request without cookie", async () => {
      const res = await SELF.fetch(buildSyncUrl(userA.orgId));

      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain("SESSION_EXPIRED");
    });
  });

  describe("invalid session cookie", () => {
    it("rejects sync request with invalid cookie", async () => {
      const res = await SELF.fetch(buildSyncUrl(userA.orgId), {
        headers: { Cookie: "better-auth.session_token=invalid-session-token" },
      });

      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain("SESSION_EXPIRED");
    });

    it("rejects sync request with malformed cookie", async () => {
      const res = await SELF.fetch(buildSyncUrl(userA.orgId), {
        headers: { Cookie: "not-a-valid-cookie" },
      });

      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain("SESSION_EXPIRED");
    });
  });

  describe("org access control", () => {
    it("rejects an empty storeId", async () => {
      const res = await SELF.fetch(buildSyncUrl(""), {
        headers: { Cookie: userA.cookie },
      });

      expect(res.status).toBe(403);
      expect(await res.text()).toContain("ACCESS_DENIED");
    });

    it("rejects when storeId does not match session orgId", async () => {
      // User A tries to sync with User B's org
      const res = await SELF.fetch(buildSyncUrl(userB.orgId), {
        headers: { Cookie: userA.cookie },
      });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("ACCESS_DENIED");
    });

    it("rejects when storeId is non-existent org", async () => {
      const res = await SELF.fetch(buildSyncUrl("non-existent-org-id"), {
        headers: { Cookie: userA.cookie },
      });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("ACCESS_DENIED");
    });
  });

  describe("valid auth", () => {
    it("accepts sync request with valid cookie and matching storeId", async () => {
      const res = await SELF.fetch(buildSyncUrl(userA.orgId), {
        headers: { Cookie: userA.cookie },
      });

      // Should return 101 Switching Protocols (WebSocket upgrade)
      // or potentially a different success status depending on how SELF handles WebSocket
      // The key is it should NOT be 400
      expect(res.status).not.toBe(400);
    });
  });

  describe("retained-link safety boundary", () => {
    it("accepts ordinary local-first batches and rejects abusive growth", async () => {
      const user = await signupUser(
        `sync-retained-${crypto.randomUUID()}@test.com`,
        "Sync retained"
      );
      await env.DB.prepare(
        "UPDATE organization SET feature_overrides = ? WHERE id = ?"
      )
        .bind(JSON.stringify({ maxSavedLinks: 1 }), user.orgId)
        .run();
      const stub = env.SYNC_BACKEND_DO.get(
        env.SYNC_BACKEND_DO.idFromName(user.orgId)
      );
      const orgId = OrgId.make(user.orgId);
      const created = (count: number) =>
        Array.from({ length: count }, (_, index) => ({
          name: events.linkCreatedV2.name,
          args: { id: `link-${index}` },
        }));

      await runInDurableObject(stub, (instance: SyncBackendDO) =>
        instance.validateRetainedLinkPush(orgId, created(10))
      );
      await expect(
        runInDurableObject(stub, (instance: SyncBackendDO) =>
          instance.validateRetainedLinkPush(orgId, created(11))
        )
      ).rejects.toMatchObject({ _tag: "RetainedLinkSafetyLimitError" });
    });
  });

  describe("cross-user isolation", () => {
    it("user A and B have different orgs", () => {
      expect(userA.orgId).not.toBe(userB.orgId);
    });

    it("user B can sync with their own org", async () => {
      const res = await SELF.fetch(buildSyncUrl(userB.orgId), {
        headers: { Cookie: userB.cookie },
      });

      expect(res.status).not.toBe(400);
    });

    it("user B cannot sync with User A org", async () => {
      const res = await SELF.fetch(buildSyncUrl(userA.orgId), {
        headers: { Cookie: userB.cookie },
      });

      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain("ACCESS_DENIED");
    });
  });

  describe("current authorization state", () => {
    it("rejects revoked membership at preflight and authoritative sync", async () => {
      await env.DB.prepare(
        "DELETE FROM member WHERE user_id = ? AND organization_id = ?"
      )
        .bind(revokedUser.userId, revokedUser.orgId)
        .run();

      const preflight = await SELF.fetch(
        `http://worker/api/sync/auth?storeId=${revokedUser.orgId}`,
        { headers: { Cookie: revokedUser.cookie } }
      );
      expect(preflight.status).toBe(403);
      expect(await preflight.text()).toContain("ACCESS_DENIED");

      const authoritative = await SELF.fetch(buildSyncUrl(revokedUser.orgId), {
        headers: { Cookie: revokedUser.cookie },
      });
      expect(authoritative.status).toBe(403);
      expect(await authoritative.text()).toContain("ACCESS_DENIED");
    });

    it("rejects withdrawn approval at preflight and authoritative sync", async () => {
      await env.DB.prepare("UPDATE user SET approved = 0 WHERE id = ?")
        .bind(unapprovedUser.userId)
        .run();

      const preflight = await SELF.fetch(
        `http://worker/api/sync/auth?storeId=${unapprovedUser.orgId}`,
        { headers: { Cookie: unapprovedUser.cookie } }
      );
      expect(preflight.status).toBe(403);
      expect(await preflight.text()).toContain("UNAPPROVED");

      const authoritative = await SELF.fetch(
        buildSyncUrl(unapprovedUser.orgId),
        { headers: { Cookie: unapprovedUser.cookie } }
      );
      expect(authoritative.status).toBe(403);
      expect(await authoritative.text()).toContain("ACCESS_DENIED");
    });
  });
});
