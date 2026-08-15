import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { signupUser } from "./helpers";

const jsonHeaders = (cookie: string) => ({
  "Content-Type": "application/json",
  Cookie: cookie,
  Origin: "http://localhost",
});

const grantPublicApi = async (...orgIds: string[]): Promise<void> => {
  const placeholders = orgIds.map(() => "?").join(", ");
  await env.DB.prepare(
    `UPDATE organization SET feature_overrides = ? WHERE id IN (${placeholders})`
  )
    .bind(JSON.stringify({ publicApi: true }), ...orgIds)
    .run();
};

const expectApiKeyCreated = async (response: Response): Promise<void> => {
  const responseBody = await response.clone().text();
  expect(response.status, responseBody).toBe(200);
};

describe("tenant isolation", () => {
  it("server-stamps immutable key scope and denies cross-workspace use", async () => {
    const owner = await signupUser(
      "tenant-key-owner@test.com",
      "Tenant Key Owner"
    );
    const victim = await signupUser(
      "tenant-key-victim@test.com",
      "Tenant Key Victim"
    );
    await grantPublicApi(owner.orgId, victim.orgId);

    const create = await SELF.fetch("http://worker/api/auth/api-key/create", {
      method: "POST",
      headers: jsonHeaders(owner.cookie),
      body: JSON.stringify({
        name: "Adversarial key",
        metadata: { orgId: victim.orgId, source: "client" },
      }),
    });
    await expectApiKeyCreated(create);
    const created = (await create.json()) as { id: string; key: string };
    expect(created.id).toBeTruthy();
    expect(created.key).toBeTruthy();

    const emptyStoreParams = new URLSearchParams({
      storeId: "",
      transport: "ws",
      payload: JSON.stringify({ apiKey: created.key }),
    });
    const emptyStore = await SELF.fetch(
      `http://worker/sync?${emptyStoreParams}`,
      {
        headers: {
          Origin: "chrome-extension://bdommhffamndfanbpnikgmpjncpcobia",
        },
      }
    );
    expect(emptyStore.status).toBe(403);
    expect(await emptyStore.text()).toContain("ACCESS_DENIED");

    const stored = await env.DB.prepare(
      "SELECT metadata, reference_id AS referenceId FROM apikey WHERE id = ?"
    )
      .bind(created.id)
      .first<{ metadata: string; referenceId: string }>();
    expect(stored?.referenceId).toBe(owner.userId);
    expect(JSON.parse(stored!.metadata)).toEqual({
      orgId: owner.orgId,
      source: "api",
    });

    const update = await SELF.fetch("http://worker/api/auth/api-key/update", {
      method: "POST",
      headers: jsonHeaders(owner.cookie),
      body: JSON.stringify({
        keyId: created.id,
        metadata: { orgId: victim.orgId },
      }),
    });
    expect(update.status).toBe(400);
    expect(await update.json()).toEqual({
      error: "API key workspace scope is immutable",
    });

    const afterUpdate = await env.DB.prepare(
      "SELECT metadata FROM apikey WHERE id = ?"
    )
      .bind(created.id)
      .first<{ metadata: string }>();
    expect(JSON.parse(afterUpdate!.metadata)).toEqual({
      orgId: owner.orgId,
      source: "api",
    });

    await env.DB.prepare("UPDATE apikey SET metadata = ? WHERE id = ?")
      .bind(JSON.stringify({ orgId: victim.orgId }), created.id)
      .run();

    const links = await SELF.fetch("http://worker/api/links", {
      headers: { Authorization: `Bearer ${created.key}` },
    });
    expect(links.status).toBe(403);

    const ingest = await SELF.fetch("http://worker/api/ingest", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${created.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://example.com/cross-workspace" }),
    });
    expect(ingest.status).toBe(403);

    const syncParams = new URLSearchParams({
      storeId: victim.orgId,
      transport: "ws",
      payload: JSON.stringify({ apiKey: created.key }),
    });
    const sync = await SELF.fetch(`http://worker/sync?${syncParams}`, {
      headers: {
        Origin: "chrome-extension://bdommhffamndfanbpnikgmpjncpcobia",
      },
    });
    expect(sync.status).toBe(403);
    expect(await sync.text()).toContain("ACCESS_DENIED");
  });

  it("denies API keys after membership or approval is withdrawn", async () => {
    const revoked = await signupUser(
      "tenant-revoked-key@test.com",
      "Tenant Revoked Key"
    );
    const unapproved = await signupUser(
      "tenant-unapproved-key@test.com",
      "Tenant Unapproved Key"
    );
    await grantPublicApi(revoked.orgId, unapproved.orgId);

    const createKey = async (cookie: string): Promise<string> => {
      const response = await SELF.fetch(
        "http://worker/api/auth/api-key/create",
        {
          method: "POST",
          headers: jsonHeaders(cookie),
          body: JSON.stringify({ name: "Current-access key" }),
        }
      );
      await expectApiKeyCreated(response);
      const body: unknown = await response.json();
      if (
        typeof body !== "object" ||
        body === null ||
        !("key" in body) ||
        typeof body.key !== "string"
      ) {
        throw new Error("API key creation response is missing key");
      }
      return body.key;
    };
    const revokedKey = await createKey(revoked.cookie);
    const unapprovedKey = await createKey(unapproved.cookie);

    await env.DB.prepare(
      "DELETE FROM member WHERE user_id = ? AND organization_id = ?"
    )
      .bind(revoked.userId, revoked.orgId)
      .run();
    await env.DB.prepare("UPDATE user SET approved = 0 WHERE id = ?")
      .bind(unapproved.userId)
      .run();

    const links = await SELF.fetch("http://worker/api/links", {
      headers: { Authorization: `Bearer ${revokedKey}` },
    });
    expect(links.status).toBe(403);

    const ingest = await SELF.fetch("http://worker/api/ingest", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${unapprovedKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://example.com/revoked-access" }),
    });
    expect(ingest.status).toBe(403);

    const syncParams = new URLSearchParams({
      storeId: revoked.orgId,
      transport: "ws",
      payload: JSON.stringify({ apiKey: revokedKey }),
    });
    const sync = await SELF.fetch(`http://worker/sync?${syncParams}`, {
      headers: {
        Origin: "chrome-extension://bdommhffamndfanbpnikgmpjncpcobia",
      },
    });
    expect(sync.status).toBe(403);
    expect(await sync.text()).toContain("ACCESS_DENIED");
  });
});
