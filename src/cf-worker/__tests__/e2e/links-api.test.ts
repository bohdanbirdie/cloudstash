import { abortAllDurableObjects, env, SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { OrgId } from "../../db/branded";
import { signupUser } from "./helpers";

const SAVED_URL = "https://example.com/rest-api-link";
const SECOND_URL = "https://example.net/rest-api-second";

type ApiLink = {
  id: string;
  state: "inbox" | "completed" | "archive";
  tags: string[];
  url: string;
};

const json = (apiKey: string) => ({
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
});

describe("Links REST API", () => {
  let apiKey: string;
  let orgId: string;
  let restoreFetch: (() => void) | undefined;

  beforeAll(async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        const request = new Request(input, init);
        if (request.url === SAVED_URL || request.url === SECOND_URL) {
          return new Response(`<!doctype html><title>${request.url}</title>`, {
            headers: { "Content-Type": "text/html" },
          });
        }
        throw new Error(`Unexpected outbound request: ${request.url}`);
      });
    restoreFetch = () => fetchSpy.mockRestore();

    const user = await signupUser("links-api@test.com", "Links API User");
    orgId = user.orgId;
    await env.DB.prepare(
      "UPDATE organization SET feature_overrides = ? WHERE id = ?"
    )
      .bind(JSON.stringify({ publicApi: true }), user.orgId)
      .run();
    const response = await SELF.fetch("http://worker/api/auth/api-key/create", {
      body: JSON.stringify({ name: "Links API test" }),
      headers: {
        Cookie: user.cookie,
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      method: "POST",
    });
    expect(response.status, await response.clone().text()).toBe(200);
    apiKey = (await response.json<{ key: string }>()).key;
  });

  afterAll(() => restoreFetch?.());

  it("provides CRUD, pagination, search, and bounded batch updates", async () => {
    const createdResponse = await SELF.fetch("http://worker/api/links", {
      body: JSON.stringify({ url: SAVED_URL, tags: ["cobalt"] }),
      headers: json(apiKey),
      method: "POST",
    });
    expect(createdResponse.status, await createdResponse.clone().text()).toBe(
      200
    );
    const created = (await createdResponse.json()) as {
      created: boolean;
      link: ApiLink;
    };
    expect(created).toMatchObject({
      created: true,
      link: { state: "inbox", tags: ["cobalt"], url: SAVED_URL },
    });

    const secondResponse = await SELF.fetch("http://worker/api/links", {
      body: JSON.stringify({ url: SECOND_URL, tags: ["saffron"] }),
      headers: json(apiKey),
      method: "POST",
    });
    expect(secondResponse.status, await secondResponse.clone().text()).toBe(
      200
    );
    const second = (await secondResponse.json()) as {
      created: boolean;
      link: ApiLink;
    };

    const listResponse = await SELF.fetch(
      "http://worker/api/links?state=active&limit=10&sort=newest",
      { headers: json(apiKey) }
    );
    expect(listResponse.status).toBe(200);
    const listed = (await listResponse.json()) as {
      links: ApiLink[];
      total: number;
    };
    expect(listed.total).toBe(2);
    expect(listed.links.map(({ id }) => id)).toEqual(
      expect.arrayContaining([created.link.id, second.link.id])
    );

    const getResponse = await SELF.fetch(
      `http://worker/api/links/${created.link.id}`,
      { headers: json(apiKey) }
    );
    expect(getResponse.status).toBe(200);
    expect(await getResponse.json()).toMatchObject({ id: created.link.id });

    const searchResponse = await SELF.fetch(
      "http://worker/api/links?q=cobalt%20saffron&limit=5",
      { headers: json(apiKey) }
    );
    expect(searchResponse.status).toBe(200);
    const anyTerm = (await searchResponse.json()) as { links: ApiLink[] };
    expect(anyTerm.links.map(({ id }) => id)).toEqual(
      expect.arrayContaining([created.link.id, second.link.id])
    );

    const allTermsResponse = await SELF.fetch(
      "http://worker/api/links?q=cobalt%20saffron&match=all&limit=5",
      { headers: json(apiKey) }
    );
    expect(allTermsResponse.status).toBe(200);
    expect(await allTermsResponse.json()).toMatchObject({
      links: [],
      total: 0,
    });

    const updateResponse = await SELF.fetch(
      `http://worker/api/links/${created.link.id}`,
      {
        body: JSON.stringify({ tags: { add: ["review"] } }),
        headers: json(apiKey),
        method: "PATCH",
      }
    );
    expect(updateResponse.status).toBe(200);
    expect(await updateResponse.json()).toMatchObject({
      id: created.link.id,
      tags: ["cobalt", "review"],
    });

    const overLimitBatch = await SELF.fetch(
      "http://worker/api/links/batch-update",
      {
        body: JSON.stringify({
          ids: [created.link.id, second.link.id],
          changes: { state: "completed" },
          limit: 1,
        }),
        headers: json(apiKey),
        method: "POST",
      }
    );
    expect(overLimitBatch.status).toBe(400);

    const batchResponse = await SELF.fetch(
      "http://worker/api/links/batch-update",
      {
        body: JSON.stringify({
          ids: [created.link.id],
          changes: { state: "completed" },
        }),
        headers: json(apiKey),
        method: "POST",
      }
    );
    expect(batchResponse.status).toBe(200);
    expect(await batchResponse.json()).toMatchObject({
      links: [{ id: created.link.id, state: "completed" }],
      updated: 1,
    });

    const archiveResponse = await SELF.fetch(
      `http://worker/api/links/${second.link.id}`,
      {
        body: JSON.stringify({ state: "archive" }),
        headers: json(apiKey),
        method: "PATCH",
      }
    );
    expect(archiveResponse.status).toBe(200);

    const listIds = async (state: string) => {
      const response = await SELF.fetch(
        `http://worker/api/links?state=${state}&limit=10`,
        { headers: json(apiKey) }
      );
      expect(response.status).toBe(200);
      const body = (await response.json()) as { links: ApiLink[] };
      return body.links.map(({ id }) => id);
    };
    expect(await listIds("active")).toEqual([created.link.id]);
    expect(await listIds("all")).toEqual([created.link.id]);
    expect(await listIds("archive")).toEqual([second.link.id]);
    expect(await listIds("any")).toEqual(
      expect.arrayContaining([created.link.id, second.link.id])
    );
  });

  it("rejects unsupported reprocessing controls and oversized bodies", async () => {
    const unsupported = await SELF.fetch("http://worker/api/links/not-used", {
      body: JSON.stringify({ reprocess: true }),
      headers: json(apiKey),
      method: "PATCH",
    });
    expect(unsupported.status).toBe(400);

    const tooLarge = await SELF.fetch("http://worker/api/links", {
      body: JSON.stringify({ url: SAVED_URL, extra: "x".repeat(70_000) }),
      headers: json(apiKey),
      method: "POST",
    });
    expect(tooLarge.status).toBe(413);
  });

  it("permanently fences workspace operations after deletion", async () => {
    const workspace = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(orgId)
    );
    await workspace.markDeleting();
    await workspace.purgeAll();
    await abortAllDurableObjects();

    const freshWorkspace = env.LINK_PROCESSOR_DO.get(
      env.LINK_PROCESSOR_DO.idFromName(orgId)
    );
    await freshWorkspace.syncUpdateRpc(new Uint8Array(), orgId);
    expect(await freshWorkspace.triggerDigest(OrgId.make(orgId))).toEqual({
      status: "dropped-deletion",
    });

    const response = await SELF.fetch("http://worker/api/links", {
      headers: json(apiKey),
    });
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({
      error: "Workspace is being deleted",
    });
  });
});
