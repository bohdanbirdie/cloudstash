import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  authClient: {},
  loadAuth: vi.fn(async () => null),
}));

import { Route } from "@/routes/oauth-consent";

describe("OAuth consent route", () => {
  it("preserves the signed OAuth query when login is required", async () => {
    const result = await Route.options.beforeLoad!({} as never)
      .then(() => null)
      .catch((error: unknown) => error);

    expect(result).toBeInstanceOf(Response);
    const options = (result as unknown as { options: Record<string, unknown> })
      .options;
    expect(options).toMatchObject({ search: true, to: "/login" });
  });
});
