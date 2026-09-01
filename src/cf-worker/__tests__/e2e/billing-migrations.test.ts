import { describe, expect, it } from "@effect/vitest";
import { env, SELF } from "cloudflare:test";
import { Schema } from "effect";

import { signupUser } from "./helpers";

const TestMigration = Schema.Struct({
  tag: Schema.String,
  sql: Schema.String,
});
const TestMigrations = Schema.Array(TestMigration);

const migrationStatements = (tag: string): readonly string[] => {
  const migrations = Schema.decodeUnknownSync(TestMigrations)(
    JSON.parse(env.TEST_MIGRATIONS)
  );
  const migration = migrations.find((candidate) => candidate.tag === tag);
  if (!migration) {
    throw new Error(`Missing test migration: ${tag}`);
  }
  return migration.sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
};

describe("billing migrations E2E", () => {
  it("preserves legacy admin access while normalizing Stripe state", async () => {
    const user = await signupUser(
      `legacy-admin-tier-${crypto.randomUUID()}@test.com`,
      "Legacy Admin Tier"
    );
    const usageCycleAnchor = Date.UTC(2026, 6, 12);

    await env.DB.prepare(
      `UPDATE organization
       SET tier = 'pro',
           tier_source = 'admin',
           usage_cycle_anchor = ?,
           admin_tier_grant = NULL,
           admin_tier_granted_at = NULL
       WHERE id = ?`
    )
      .bind(usageCycleAnchor, user.orgId)
      .run();

    for (const statement of migrationStatements(
      "0020_backfill_admin_tier_grants"
    )) {
      await env.DB.prepare(statement).run();
    }

    const row = await env.DB.prepare(
      `SELECT tier,
              tier_source,
              admin_tier_grant,
              admin_tier_granted_at
       FROM organization
       WHERE id = ?`
    )
      .bind(user.orgId)
      .first<{
        tier: string;
        tier_source: string;
        admin_tier_grant: string | null;
        admin_tier_granted_at: number | null;
      }>();

    expect(row).toEqual({
      tier: "free",
      tier_source: "stripe",
      admin_tier_grant: "pro",
      admin_tier_granted_at: usageCycleAnchor,
    });

    const sessionsRes = await SELF.fetch(
      `http://worker/api/chat/sessions?workspaceId=${user.orgId}`,
      { headers: { Cookie: user.cookie } }
    );
    expect(sessionsRes.status).toBe(200);
  });
});
