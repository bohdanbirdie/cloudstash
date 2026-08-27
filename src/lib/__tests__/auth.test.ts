// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    getSession,
    signOut: vi.fn(),
  }),
}));

import { invalidateAuthCache, loadAuth } from "@/lib/auth";

describe("loadAuth", () => {
  afterEach(() => {
    invalidateAuthCache();
    getSession.mockReset();
  });

  it("bypasses Better Auth's cookie cache for approval-sensitive app entry", async () => {
    getSession.mockResolvedValue({
      data: {
        session: {
          activeOrganizationId: "org-1",
        },
        user: {
          approved: true,
          email: "approved@test.com",
          id: "user-1",
          image: null,
          name: "Approved User",
          role: "user",
        },
      },
      error: null,
    } as never);

    const auth = await loadAuth();

    expect(auth?.isAuthenticated).toBe(true);
    expect(getSession).toHaveBeenCalledWith({
      fetchOptions: { query: { disableCookieCache: "true" } },
    });
  });
});
