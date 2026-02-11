import { describe, it, expect, vi } from "vitest";

import { trackEvent, queryUsage } from "../../analytics";

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
    // Should not throw
    trackEvent(undefined, {
      userId: "usr_abc",
      event: "sync",
      orgId: "org_xyz",
    });
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

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      })
    );

    const result = await queryUsage("acct_id", "token", {
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

    vi.unstubAllGlobals();
  });

  it("prevents string concatenation bug in downstream reduce", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [
              { userId: "u1", event: "sync", count: "9" },
              { userId: "u1", event: "auth", count: "5" },
            ],
          }),
      })
    );

    const result = await queryUsage("acct_id", "token", {
      period: "7d",
      dataset: "ds",
    });

    // Without Number() conversion: 0 + "9" + "5" = "095" (string concatenation)
    // With Number() conversion: 0 + 9 + 5 = 14
    const total = result.rows.reduce((sum, r) => sum + r.count, 0);
    expect(total).toBe(14);

    vi.unstubAllGlobals();
  });

  it("sends correct SQL query for each period", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await queryUsage("acct_id", "token", {
      period: "30d",
      dataset: "my_dataset",
    });

    const body = fetchMock.mock.calls[0][1].body as string;
    expect(body).toContain("FROM my_dataset");
    expect(body).toContain("INTERVAL '30' DAY");

    vi.unstubAllGlobals();
  });

  it("throws on non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve("Forbidden"),
      })
    );

    await expect(
      queryUsage("acct_id", "token", { period: "24h", dataset: "test" })
    ).rejects.toThrow("Analytics query failed: 403 Forbidden");

    vi.unstubAllGlobals();
  });

  it("handles null data from API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: null }),
      })
    );

    const result = await queryUsage("acct_id", "token", {
      period: "24h",
      dataset: "test",
    });
    expect(result.rows).toEqual([]);

    vi.unstubAllGlobals();
  });
});
