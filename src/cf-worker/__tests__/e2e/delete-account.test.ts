import {
  env,
  SELF,
  introspectWorkflowInstance,
  runInDurableObject,
} from "cloudflare:test";
import { Effect } from "effect";
import { describe, it, expect } from "vitest";

import { deleteOrgData } from "../../account-deletion/workflow";
import { OrgId, UserId } from "../../db/branded";
import { DbClientLive } from "../../db/service";
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
  activityByOrgId:
    "SELECT count(*) AS n FROM activity_events WHERE organization_id = ?",
} as const;

async function count(query: keyof typeof COUNT_QUERIES, value: string) {
  const row = await env.DB.prepare(COUNT_QUERIES[query])
    .bind(value)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

const seedDeletionProbe = (stub: DurableObjectStub): Promise<void> =>
  runInDurableObject(stub, async (_instance, state) => {
    await state.storage.put("deletion-probe", true);
  });

const readActorState = (
  stub: DurableObjectStub
): Promise<{ probe: boolean | undefined; retired: boolean | undefined }> =>
  runInDurableObject(stub, async (_instance, state) => ({
    probe: await state.storage.get<boolean>("deletion-probe"),
    retired: await state.storage.get<boolean>("__retired__"),
  }));

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
    // Mirrors an admin-granted paid tier: entitlement without a Stripe
    // subscription. Deletion must not infer billing from the visible tier.
    await env.DB.prepare(
      `UPDATE organization
       SET tier = 'pro', tier_source = 'admin', stripe_subscription_id = NULL
       WHERE id = ?`
    )
      .bind(user.orgId)
      .run();
    await expectForeignKeysEnforced(user.userId);
    const { clientId: oauthClientId, resourceId } = await seedMcpOAuthRows(
      user.userId
    );
    const syncBackend = env.SYNC_BACKEND_DO.get(
      env.SYNC_BACKEND_DO.idFromName(user.orgId)
    );
    const linkProcessor = env.LIBRARY_DO.get(
      env.LIBRARY_DO.idFromName(user.orgId)
    );
    const chatAgent = env.Chat.get(env.Chat.idFromName(user.orgId));
    const xBookmarkSync = env.X_BOOKMARK_SYNC_DO.get(
      env.X_BOOKMARK_SYNC_DO.idFromName(user.userId)
    );
    await Promise.all([
      seedDeletionProbe(syncBackend),
      seedDeletionProbe(linkProcessor),
      seedDeletionProbe(chatAgent),
      seedDeletionProbe(xBookmarkSync),
      env.TELEGRAM_KV.put("telegram:101", "secret-key"),
      env.TELEGRAM_KV.put(
        `telegram-user:${user.userId}`,
        JSON.stringify([101])
      ),
      env.ENRICHMENT_USAGE.put(`enrichment:${user.orgId}:2026-08`, "1"),
    ]);

    try {
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
      await env.DB.prepare(
        `INSERT INTO activity_events
          (organization_id, user_id, type, occurred_at)
         VALUES (?, ?, 'link_saved', ?)`
      )
        .bind(user.orgId, user.userId, Date.now())
        .run();

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

      await using instance = await introspectWorkflowInstance(
        env.ACCOUNT_DELETION,
        user.orgId
      );
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
      expect(await count("activityByOrgId", user.orgId)).toBe(0);
      const [syncState, linkState, chatState, xState] = await Promise.all([
        readActorState(
          env.SYNC_BACKEND_DO.get(env.SYNC_BACKEND_DO.idFromName(user.orgId))
        ),
        readActorState(
          env.LIBRARY_DO.get(env.LIBRARY_DO.idFromName(user.orgId))
        ),
        readActorState(env.Chat.get(env.Chat.idFromName(user.orgId))),
        readActorState(
          env.X_BOOKMARK_SYNC_DO.get(
            env.X_BOOKMARK_SYNC_DO.idFromName(user.userId)
          )
        ),
      ]);
      expect(syncState).toEqual({ probe: undefined, retired: undefined });
      for (const state of [linkState, chatState]) {
        expect(state).toEqual({ probe: undefined, retired: true });
      }
      const lateChatResponse = await chatAgent.fetch(
        "http://chat-agent.test/late"
      );
      expect(lateChatResponse.status).toBe(410);
      expect(xState).toEqual({ probe: undefined, retired: undefined });
      expect(await env.TELEGRAM_KV.get("telegram:101")).toBeNull();
      expect(
        await env.TELEGRAM_KV.get(`telegram-user:${user.userId}`)
      ).toBeNull();
      expect(
        await env.ENRICHMENT_USAGE.get(`enrichment:${user.orgId}:2026-08`)
      ).toBeNull();
      await expect(
        env.DB.prepare(
          `INSERT INTO activity_events
            (organization_id, user_id, type, occurred_at)
           VALUES (?, ?, 'link_saved', ?)`
        )
          .bind(user.orgId, user.userId, Date.now())
          .run()
      ).rejects.toThrow();
      expect(await count("activityByOrgId", user.orgId)).toBe(0);
    } finally {
      await env.DB.prepare("DELETE FROM oauth_resource WHERE identifier = ?")
        .bind(resourceId)
        .run();
    }
  });

  it("keeps the Better Auth identity when deletion preparation fails", async () => {
    const user = await signupUser(
      "delete-fail-closed@test.com",
      "Delete Fail Closed"
    );
    await env.DB.prepare(
      "UPDATE member SET role = 'member' WHERE user_id = ? AND organization_id = ?"
    )
      .bind(user.userId, user.orgId)
      .run();

    const response = await SELF.fetch("http://worker/api/auth/delete-user", {
      method: "POST",
      headers: {
        Cookie: user.cookie,
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify({ callbackURL: "/" }),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await count("userById", user.userId)).toBe(1);
    expect(await count("organizationById", user.orgId)).toBe(1);
    expect(await count("memberByUserId", user.userId)).toBe(1);
    expect(await count("sessionByUserId", user.userId)).toBe(1);
    expect(await count("accountByUserId", user.userId)).toBe(1);
  });

  it("does not delete a personal workspace that has another member", async () => {
    const owner = await signupUser(
      "delete-shared-owner@test.com",
      "Shared Owner"
    );
    const member = await signupUser(
      "delete-shared-member@test.com",
      "Shared Member"
    );
    const membershipId = `shared-member-${owner.orgId}`;
    await env.DB.prepare(
      `INSERT INTO member (id, organization_id, user_id, role)
       VALUES (?, ?, ?, 'member')`
    )
      .bind(membershipId, owner.orgId, member.userId)
      .run();
    await env.DB.prepare(
      `INSERT INTO activity_events
        (organization_id, user_id, type, occurred_at)
       VALUES (?, ?, 'link_saved', ?)`
    )
      .bind(owner.orgId, owner.userId, Date.now())
      .run();

    await expect(
      Effect.runPromise(
        deleteOrgData({
          orgId: OrgId.make(owner.orgId),
          stripeSubscriptionId: null,
          userId: UserId.make(owner.userId),
        }).pipe(Effect.provide(DbClientLive(env.DB)))
      )
    ).rejects.toMatchObject({ _tag: "SharedPersonalOrgError" });

    const response = await SELF.fetch("http://worker/api/auth/delete-user", {
      method: "POST",
      headers: {
        Cookie: owner.cookie,
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify({ callbackURL: "/" }),
    });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await count("userById", owner.userId)).toBe(1);
    expect(await count("organizationById", owner.orgId)).toBe(1);
    expect(await count("activityByOrgId", owner.orgId)).toBe(1);
    const membership = await env.DB.prepare(
      "SELECT id FROM member WHERE id = ?"
    )
      .bind(membershipId)
      .first<{ id: string }>();
    expect(membership?.id).toBe(membershipId);
  });

  it("preserves invitations created for other people when their creator is deleted", async () => {
    const creator = await signupUser(
      "delete-invite-creator@test.com",
      "Invite Creator"
    );
    const otherOrgId = `other-${creator.orgId}`;
    const invitationId = `organization-invitation-${creator.userId}`;
    const inviteId = `global-invite-${creator.userId}`;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO organization (id, name, slug) VALUES (?, ?, ?)"
      ).bind(otherOrgId, "Other Workspace", otherOrgId),
      env.DB.prepare(
        `INSERT INTO invitation
          (email, expires_at, id, inviter_id, organization_id, role, status)
         VALUES (?, ?, ?, ?, ?, 'member', 'pending')`
      ).bind(
        "invitee@test.com",
        Date.now() + 86_400_000,
        invitationId,
        creator.userId,
        otherOrgId
      ),
      env.DB.prepare(
        "INSERT INTO invite (code, id, created_by_user_id) VALUES (?, ?, ?)"
      ).bind(`CODE-${creator.userId}`, inviteId, creator.userId),
    ]);

    try {
      const response = await SELF.fetch("http://worker/api/auth/delete-user", {
        method: "POST",
        headers: {
          Cookie: creator.cookie,
          "Content-Type": "application/json",
          Origin: "http://localhost",
        },
        body: JSON.stringify({ callbackURL: "/" }),
      });
      expect(response.status).toBe(200);
      await using instance = await introspectWorkflowInstance(
        env.ACCOUNT_DELETION,
        creator.orgId
      );
      await instance.waitForStatus("complete");

      const organizationInvitation = await env.DB.prepare(
        "SELECT inviter_id FROM invitation WHERE id = ?"
      )
        .bind(invitationId)
        .first<{ inviter_id: string | null }>();
      const globalInvite = await env.DB.prepare(
        "SELECT created_by_user_id FROM invite WHERE id = ?"
      )
        .bind(inviteId)
        .first<{ created_by_user_id: string | null }>();
      expect(organizationInvitation).toEqual({ inviter_id: null });
      expect(globalInvite).toEqual({ created_by_user_id: null });
      expect(await count("organizationById", otherOrgId)).toBe(1);
    } finally {
      await env.DB.prepare("DELETE FROM organization WHERE id = ?")
        .bind(otherOrgId)
        .run();
      await env.DB.prepare("DELETE FROM invite WHERE id = ?")
        .bind(inviteId)
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
    await using instance = await introspectWorkflowInstance(
      env.ACCOUNT_DELETION,
      redeemer.orgId
    );
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
