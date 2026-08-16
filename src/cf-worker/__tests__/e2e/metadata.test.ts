import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

const signup = async (email: string) => {
  const response = await SELF.fetch("http://worker/api/auth/sign-up/email", {
    body: JSON.stringify({
      email,
      name: "Metadata Test",
      password: "test-password-123",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error(await response.text());
  const cookie = response.headers.get("set-cookie");
  if (!cookie) throw new Error("Missing session cookie");
  const me = (await (
    await SELF.fetch("http://worker/api/auth/me", {
      headers: { Cookie: cookie },
    })
  ).json()) as {
    session: { activeOrganizationId: string };
    user: { id: string };
  };
  return {
    cookie,
    orgId: me.session.activeOrganizationId,
    userId: me.user.id,
  };
};

const previewUrl =
  "http://worker/api/metadata?url=http%3A%2F%2Fworker%2Fprivate";

describe("metadata preview boundary", () => {
  let approved: Awaited<ReturnType<typeof signup>>;
  let unapproved: Awaited<ReturnType<typeof signup>>;
  let revoked: Awaited<ReturnType<typeof signup>>;

  beforeAll(async () => {
    approved = await signup("metadata-approved@test.com");
    unapproved = await signup("metadata-unapproved@test.com");
    revoked = await signup("metadata-revoked@test.com");
    await env.DB.prepare("UPDATE user SET approved = 0 WHERE id = ?")
      .bind(unapproved.userId)
      .run();
    await env.DB.prepare(
      "DELETE FROM member WHERE userId = ? AND organizationId = ?"
    )
      .bind(revoked.userId, revoked.orgId)
      .run();
  });

  it("rejects an anonymous request before target handling", async () => {
    const response = await SELF.fetch(previewUrl);
    expect(response.status).toBe(401);
  });

  it("rejects an invalid session", async () => {
    const response = await SELF.fetch(previewUrl, {
      headers: { Cookie: "better-auth.session_token=invalid" },
    });
    expect(response.status).toBe(401);
  });

  it("rejects an unapproved user", async () => {
    const response = await SELF.fetch(previewUrl, {
      headers: { Cookie: unapproved.cookie },
    });
    expect(response.status).toBe(403);
  });

  it("rejects a user without current membership", async () => {
    const response = await SELF.fetch(previewUrl, {
      headers: { Cookie: revoked.cookie },
    });
    expect(response.status).toBe(403);
  });

  it("authorizes before rejecting an unsafe target", async () => {
    const response = await SELF.fetch(previewUrl, {
      headers: { Cookie: approved.cookie },
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).not.toContain("public");
  });
});
