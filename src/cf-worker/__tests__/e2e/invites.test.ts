import { beforeAll, describe, expect, it } from "@effect/vitest";
import { env, SELF } from "cloudflare:test";

import { makeAdmin, signupUser } from "./helpers";
import type { UserInfo } from "./helpers";

// Characterization: WK-17-A.
//
// The four invite handlers in invites/service.ts each carry their own copy of
// the same error-to-response mapping (DbError -> 500, InvitesUnauthorizedError
// -> 401, InvitesForbiddenError -> 403). Nothing pinned those codes, so the
// duplication could not be collapsed safely. These tests fix the current
// contract at the HTTP boundary first; the refactor must keep them green.

const json = <T>(res: Response): Promise<T> => res.json() as Promise<T>;

interface ErrorBody {
  error: string;
}

// The signup gate defaults to open, so signupUser produces an approved user.
// Redemption short-circuits for an approved user, so the invalid-code paths
// need a pending one.
const setPending = (userId: string): Promise<unknown> =>
  env.DB.prepare("UPDATE user SET approved = 0 WHERE id = ?")
    .bind(userId)
    .run();

describe("invites endpoints", () => {
  let admin: UserInfo;
  let member: UserInfo;
  let pending: UserInfo;
  let createdInviteId: string;

  beforeAll(async () => {
    admin = await signupUser("invites-admin@test.com", "Invites Admin");
    member = await signupUser("invites-member@test.com", "Invites Member");
    pending = await signupUser("invites-pending@test.com", "Invites Pending");
    await makeAdmin(admin.userId);
    await setPending(pending.userId);
  });

  describe("POST /api/invites", () => {
    it("returns 401 without a session", async () => {
      const res = await SELF.fetch("http://worker/api/invites", {
        method: "POST",
      });
      expect(res.status).toBe(401);
      expect((await json<ErrorBody>(res)).error).toBe("Unauthorized");
    });

    it("returns 403 for a non-admin session", async () => {
      const res = await SELF.fetch("http://worker/api/invites", {
        headers: { Cookie: member.cookie },
        method: "POST",
      });
      expect(res.status).toBe(403);
      expect((await json<ErrorBody>(res)).error).toBe("Admin access required");
    });

    it("returns 400 when expiresInDays is out of range", async () => {
      const res = await SELF.fetch("http://worker/api/invites", {
        body: JSON.stringify({ expiresInDays: 0 }),
        headers: { Cookie: admin.cookie, "Content-Type": "application/json" },
        method: "POST",
      });
      expect(res.status).toBe(400);
      expect((await json<ErrorBody>(res)).error).toBeTruthy();
    });

    it("creates an invite for an admin session", async () => {
      const res = await SELF.fetch("http://worker/api/invites", {
        body: JSON.stringify({}),
        headers: { Cookie: admin.cookie, "Content-Type": "application/json" },
        method: "POST",
      });
      expect(res.status).toBe(200);

      const body = await json<{ code: string; expiresAt: string | null }>(res);
      expect(typeof body.code).toBe("string");
      expect(body.code.length).toBeGreaterThan(0);
      expect(body.expiresAt).toBeNull();
    });
  });

  describe("GET /api/invites", () => {
    it("returns 401 without a session", async () => {
      const res = await SELF.fetch("http://worker/api/invites");
      expect(res.status).toBe(401);
      expect((await json<ErrorBody>(res)).error).toBe("Unauthorized");
    });

    it("returns 403 for a non-admin session", async () => {
      const res = await SELF.fetch("http://worker/api/invites", {
        headers: { Cookie: member.cookie },
      });
      expect(res.status).toBe(403);
      expect((await json<ErrorBody>(res)).error).toBe("Admin access required");
    });

    it("lists invites for an admin session", async () => {
      const res = await SELF.fetch("http://worker/api/invites", {
        headers: { Cookie: admin.cookie },
      });
      expect(res.status).toBe(200);

      const body = await json<{ invites: { id: string }[] }>(res);
      expect(Array.isArray(body.invites)).toBe(true);
      expect(body.invites.length).toBeGreaterThan(0);

      const first = body.invites[0];
      if (!first) throw new Error("expected at least one invite");
      createdInviteId = first.id;
    });
  });

  describe("DELETE /api/invites/:id", () => {
    it("returns 401 without a session", async () => {
      const res = await SELF.fetch("http://worker/api/invites/any-id", {
        method: "DELETE",
      });
      expect(res.status).toBe(401);
      expect((await json<ErrorBody>(res)).error).toBe("Unauthorized");
    });

    it("returns 403 for a non-admin session", async () => {
      const res = await SELF.fetch("http://worker/api/invites/any-id", {
        headers: { Cookie: member.cookie },
        method: "DELETE",
      });
      expect(res.status).toBe(403);
      expect((await json<ErrorBody>(res)).error).toBe("Admin access required");
    });

    it("returns 404 for an unknown invite", async () => {
      const res = await SELF.fetch("http://worker/api/invites/does-not-exist", {
        headers: { Cookie: admin.cookie },
        method: "DELETE",
      });
      expect(res.status).toBe(404);
      expect((await json<ErrorBody>(res)).error).toBe("Invite not found");
    });

    it("deletes an existing invite for an admin session", async () => {
      const res = await SELF.fetch(
        `http://worker/api/invites/${createdInviteId}`,
        { headers: { Cookie: admin.cookie }, method: "DELETE" }
      );
      expect(res.status).toBe(200);
      expect(await json<{ success: boolean }>(res)).toEqual({ success: true });
    });
  });

  describe("POST /api/invites/redeem", () => {
    it("returns 401 without a session", async () => {
      const res = await SELF.fetch("http://worker/api/invites/redeem", {
        body: JSON.stringify({ code: "WHATEVER" }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      expect(res.status).toBe(401);
      expect((await json<ErrorBody>(res)).error).toBe("Unauthorized");
    });

    it("short-circuits to success for an already-approved user", async () => {
      const res = await SELF.fetch("http://worker/api/invites/redeem", {
        body: JSON.stringify({ code: "NOT-A-REAL-CODE" }),
        headers: { Cookie: member.cookie, "Content-Type": "application/json" },
        method: "POST",
      });
      expect(res.status).toBe(200);
      expect(await json<{ success: boolean }>(res)).toEqual({ success: true });
    });

    it("returns 400 for an unknown code", async () => {
      const res = await SELF.fetch("http://worker/api/invites/redeem", {
        body: JSON.stringify({ code: "NOT-A-REAL-CODE" }),
        headers: { Cookie: pending.cookie, "Content-Type": "application/json" },
        method: "POST",
      });
      expect(res.status).toBe(400);
      expect((await json<ErrorBody>(res)).error).toBe(
        "Invalid or expired invite code"
      );
    });

    it("returns 400 when the code is missing", async () => {
      const res = await SELF.fetch("http://worker/api/invites/redeem", {
        body: JSON.stringify({}),
        headers: { Cookie: pending.cookie, "Content-Type": "application/json" },
        method: "POST",
      });
      expect(res.status).toBe(400);
      expect((await json<ErrorBody>(res)).error).toBe(
        "Invalid or expired invite code"
      );
    });
  });
});
