import { env, SELF, introspectWorkflowInstance } from "cloudflare:test";
import { describe, it, expect } from "vitest";

import { makeAdmin, signupUser } from "./helpers";

const COUNT_QUERIES = {
  oauthAccessTokenByUserId:
    "SELECT count(*) AS n FROM oauth_access_token WHERE user_id = ?",
  oauthClientByUserId:
    "SELECT count(*) AS n FROM oauth_client WHERE user_id = ?",
  oauthClientResourceByClientId:
    "SELECT count(*) AS n FROM oauth_client_resource WHERE client_id = ?",
  oauthConsentByUserId:
    "SELECT count(*) AS n FROM oauth_consent WHERE user_id = ?",
  oauthRefreshTokenByUserId:
    "SELECT count(*) AS n FROM oauth_refresh_token WHERE user_id = ?",
  userById: "SELECT count(*) AS n FROM user WHERE id = ?",
  organizationById: "SELECT count(*) AS n FROM organization WHERE id = ?",
  memberByUserId: "SELECT count(*) AS n FROM member WHERE user_id = ?",
  sessionByUserId: "SELECT count(*) AS n FROM session WHERE user_id = ?",
  accountByUserId: "SELECT count(*) AS n FROM account WHERE user_id = ?",
} as const;

async function count(query: keyof typeof COUNT_QUERIES, value: string) {
  const row = await env.DB.prepare(COUNT_QUERIES[query])
    .bind(value)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function expectForeignKeysEnforced(userId: string): Promise<void> {
  const probeId = `fk-probe-${userId}`;
  try {
    await expect(
      env.DB.prepare(
        `INSERT INTO oauth_client_resource (id, client_id, resource_id)
         VALUES (?, ?, ?)`
      )
        .bind(probeId, `missing-client-${userId}`, `missing-resource-${userId}`)
        .run()
    ).rejects.toThrow();
  } finally {
    await env.DB.prepare("DELETE FROM oauth_client_resource WHERE id = ?")
      .bind(probeId)
      .run();
  }
}

async function seedMcpOAuthRows(
  userId: string
): Promise<{ clientId: string; resourceId: string }> {
  const session = await env.DB.prepare(
    "SELECT id FROM session WHERE user_id = ?"
  )
    .bind(userId)
    .first<{ id: string }>();
  if (!session) throw new Error("signup did not create a session");

  const clientId = `delete-client-${userId}`;
  const resourceId = `https://cloudstash.test/mcp/${userId}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO oauth_client (id, client_id, user_id, redirect_uris)
       VALUES (?, ?, ?, ?)`
    ).bind(`client-row-${userId}`, clientId, userId, "[]"),
    env.DB.prepare(
      `INSERT INTO oauth_resource (id, identifier, name)
       VALUES (?, ?, ?)`
    ).bind(`resource-row-${userId}`, resourceId, "Cloudstash"),
    env.DB.prepare(
      `INSERT INTO oauth_client_resource (id, client_id, resource_id)
       VALUES (?, ?, ?)`
    ).bind(`link-${userId}`, clientId, resourceId),
    env.DB.prepare(
      `INSERT INTO oauth_refresh_token
        (id, token, client_id, session_id, user_id, expires_at, created_at, scopes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      `refresh-${userId}`,
      `refresh-token-${userId}`,
      clientId,
      session.id,
      userId,
      2,
      1,
      '["links:read"]'
    ),
    env.DB.prepare(
      `INSERT INTO oauth_access_token
        (id, token, client_id, session_id, user_id, refresh_id, expires_at, created_at, scopes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      `access-${userId}`,
      `access-token-${userId}`,
      clientId,
      session.id,
      userId,
      `refresh-${userId}`,
      2,
      1,
      '["links:read"]'
    ),
    env.DB.prepare(
      `INSERT INTO oauth_consent
        (id, client_id, user_id, scopes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(`consent-${userId}`, clientId, userId, '["links:read"]', 1, 1),
  ]);
  return { clientId, resourceId };
}

describe("Account deletion (end-to-end)", () => {
  it("deletes the user and org across D1 + DOs and reaches workflow=complete", async () => {
    const user = await signupUser("delete-target@test.com", "Delete Target");
    await expectForeignKeysEnforced(user.userId);
    const { clientId: oauthClientId, resourceId } = await seedMcpOAuthRows(
      user.userId
    );

    try {
      await using instance = await introspectWorkflowInstance(
        env.ACCOUNT_DELETION,
        user.orgId
      );

      expect(await count("userById", user.userId)).toBe(1);
      expect(await count("organizationById", user.orgId)).toBe(1);
      expect(await count("memberByUserId", user.userId)).toBe(1);
      expect(await count("oauthAccessTokenByUserId", user.userId)).toBe(1);
      expect(await count("oauthClientByUserId", user.userId)).toBe(1);
      expect(await count("oauthClientResourceByClientId", oauthClientId)).toBe(
        1
      );
      expect(await count("oauthConsentByUserId", user.userId)).toBe(1);
      expect(await count("oauthRefreshTokenByUserId", user.userId)).toBe(1);

      const res = await SELF.fetch("http://worker/api/auth/delete-user", {
        method: "POST",
        headers: {
          Cookie: user.cookie,
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({ callbackURL: "/" }),
      });
      if (res.status !== 200) {
        throw new Error(
          `delete-user returned ${res.status}: ${await res.text()}`
        );
      }

      await instance.waitForStatus("complete");

      expect(await count("userById", user.userId)).toBe(0);
      expect(await count("organizationById", user.orgId)).toBe(0);
      expect(await count("memberByUserId", user.userId)).toBe(0);
      expect(await count("sessionByUserId", user.userId)).toBe(0);
      expect(await count("accountByUserId", user.userId)).toBe(0);
      expect(await count("oauthAccessTokenByUserId", user.userId)).toBe(0);
      expect(await count("oauthClientByUserId", user.userId)).toBe(0);
      expect(await count("oauthClientResourceByClientId", oauthClientId)).toBe(
        0
      );
      expect(await count("oauthConsentByUserId", user.userId)).toBe(0);
      expect(await count("oauthRefreshTokenByUserId", user.userId)).toBe(0);
    } finally {
      await env.DB.prepare("DELETE FROM oauth_resource WHERE identifier = ?")
        .bind(resourceId)
        .run();
    }
  });

  it("does not release a redeemed invite when the redeemer is deleted", async () => {
    const admin = await signupUser("invite-admin@test.com", "Invite Admin");
    await makeAdmin(admin.userId);

    const createRes = await SELF.fetch("http://worker/api/invites", {
      method: "POST",
      headers: { Cookie: admin.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(createRes.status).toBe(200);
    const { code } = (await createRes.json()) as { code: string };

    const redeemer = await signupUser(
      "invite-redeemer@test.com",
      "Invite Redeemer"
    );
    await env.DB.prepare("UPDATE user SET approved = 0 WHERE id = ?")
      .bind(redeemer.userId)
      .run();

    const redeemRes = await SELF.fetch("http://worker/api/invites/redeem", {
      method: "POST",
      headers: { Cookie: redeemer.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    expect(redeemRes.status).toBe(200);

    await using instance = await introspectWorkflowInstance(
      env.ACCOUNT_DELETION,
      redeemer.orgId
    );
    const deleteRes = await SELF.fetch("http://worker/api/auth/delete-user", {
      method: "POST",
      headers: {
        Cookie: redeemer.cookie,
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify({ callbackURL: "/" }),
    });
    expect(deleteRes.status).toBe(200);
    await instance.waitForStatus("complete");

    const otherUser = await signupUser("invite-other@test.com", "Other User");
    await env.DB.prepare("UPDATE user SET approved = 0 WHERE id = ?")
      .bind(otherUser.userId)
      .run();

    const replayRes = await SELF.fetch("http://worker/api/invites/redeem", {
      method: "POST",
      headers: { Cookie: otherUser.cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    expect(replayRes.status).toBe(400);
  });
});
