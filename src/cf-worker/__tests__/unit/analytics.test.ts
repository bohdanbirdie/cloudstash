import { Effect } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { describe, it, expect, vi } from "vitest";

import { trackEvent, queryUsage } from "../../analytics";

const runQueryUsage = (
  fetch: typeof globalThis.fetch,
  accountId: string,
  apiToken: string,
  opts: { period: "24h" | "7d" | "30d"; dataset: string }
) =>
  Effect.runPromise(
    queryUsage(accountId, apiToken, opts).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetch)
    )
  );

const fetchReturning = (response: Response) =>
  vi.fn<typeof globalThis.fetch>(() => Promise.resolve(response));

const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, { status });

describe("trackEvent", () => {
  it("calls writeDataPoint with correct schema", () => {
    const writeDataPoint = vi.fn();
    const analytics = { writeDataPoint } as unknown as AnalyticsEngineDataset;

    trackEvent(analytics, {
      userId: "usr_abc",
      event: "sync",
      orgId: "org_xyz",
      status: 200,
    });

    expect(writeDataPoint).toHaveBeenCalledOnce();
    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ["usr_abc"],
      blobs: ["sync", "org_xyz"],
      doubles: [200],
    });
  });

  it("defaults status to 0", () => {
    const writeDataPoint = vi.fn();
    const analytics = { writeDataPoint } as unknown as AnalyticsEngineDataset;

    trackEvent(analytics, {
      userId: "usr_abc",
      event: "auth",
      orgId: "org_xyz",
    });

    expect(writeDataPoint).toHaveBeenCalledWith({
      indexes: ["usr_abc"],
      blobs: ["auth", "org_xyz"],
      doubles: [0],
    });
  });

  it("no-ops when analytics is undefined", () => {
    expect(() =>
      trackEvent(undefined, {
        userId: "usr_abc",
        event: "sync",
        orgId: "org_xyz",
      })
    ).not.toThrow();
  });
});

describe("queryUsage", () => {
  it("converts string counts from CF API to numbers", async () => {
    const mockResponse = {
      data: [
        { userId: "usr_1", event: "sync", count: "42" },
        { userId: "usr_1", event: "auth", count: "5" },
        { userId: "usr_2", event: "sync", count: "10" },
      ],
    };

    const fetch = fetchReturning(jsonResponse(mockResponse));

    const result = await runQueryUsage(fetch, "acct_id", "token", {
      period: "24h",
      dataset: "test_dataset",
    });

    expect(result.rows).toEqual([
      { userId: "usr_1", event: "sync", count: 42 },
      { userId: "usr_1", event: "auth", count: 5 },
      { userId: "usr_2", event: "sync", count: 10 },
    ]);

    for (const row of result.rows) {
      expect(typeof row.count).toBe("number");
    }
  });

  it("prevents string concatenation bug in downstream reduce", async () => {
    const fetch = fetchReturning(
      jsonResponse({
        data: [
          { userId: "u1", event: "sync", count: "9" },
          { userId: "u1", event: "auth", count: "5" },
        ],
      })
    );

    const result = await runQueryUsage(fetch, "acct_id", "token", {
      period: "7d",
      dataset: "ds",
    });

    // Without Number() conversion: 0 + "9" + "5" = "095" (string concatenation)
    // With Number() conversion: 0 + 9 + 5 = 14
    const total = result.rows.reduce(
      (sum: number, r: { count: number }) => sum + r.count,
      0
    );
    expect(total).toBe(14);
  });

  it("sends correct SQL query for each period", async () => {
    const fetchMock = fetchReturning(jsonResponse({ data: [] }));

    await runQueryUsage(fetchMock, "acct_id", "token", {
      period: "30d",
      dataset: "my_dataset",
    });

    const requestBody = fetchMock.mock.calls.at(0)?.[1]?.body;
    if (!(requestBody instanceof Uint8Array)) {
      throw new TypeError("Expected an encoded analytics request body");
    }
    const body = new TextDecoder().decode(requestBody);
    expect(body).toContain("FROM my_dataset");
    expect(body).toContain("INTERVAL '30' DAY");
  });

  it("rejects with AnalyticsQueryError on non-ok response", async () => {
    const fetch = fetchReturning(new Response("Forbidden", { status: 403 }));

    await expect(
      runQueryUsage(fetch, "acct_id", "token", {
        period: "24h",
        dataset: "test",
      })
    ).rejects.toThrow();
  });

  it("handles null data from API", async () => {
    const fetch = fetchReturning(jsonResponse({ data: null }));

    const result = await runQueryUsage(fetch, "acct_id", "token", {
      period: "24h",
      dataset: "test",
    });
    expect(result.rows).toEqual([]);
  });
});
