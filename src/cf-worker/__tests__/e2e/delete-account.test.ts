import { env, SELF, introspectWorkflowInstance } from "cloudflare:test";
import { describe, it, expect } from "vitest";

import { signupUser } from "./helpers";

const COUNT_QUERIES = {
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

describe("Account deletion (end-to-end)", () => {
  it("deletes the user and org across D1 + DOs and reaches workflow=complete", async () => {
    const user = await signupUser("delete-target@test.com", "Delete Target");

    await using instance = await introspectWorkflowInstance(
      env.ACCOUNT_DELETION,
      user.orgId
    );

    expect(await count("userById", user.userId)).toBe(1);
    expect(await count("organizationById", user.orgId)).toBe(1);
    expect(await count("memberByUserId", user.userId)).toBe(1);

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
  });
});
