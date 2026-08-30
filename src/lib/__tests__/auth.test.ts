// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn());

const session = (approved: boolean, activeOrganizationId: string | null) =>
  ({
    data: {
      session: { activeOrganizationId },
      user: {
        approved,
        email: "user@test.com",
        id: "user-1",
        image: null,
        name: "Test User",
        role: "user",
      },
    },
    error: null,
  }) as never;

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
    getSession.mockResolvedValue(session(true, "org-1"));

    const auth = await loadAuth();

    expect(auth?.isAuthenticated).toBe(true);
    expect(getSession).toHaveBeenCalledWith({
      fetchOptions: { query: { disableCookieCache: "true" } },
    });
  });
});

// FE-05-A. isAuthenticated used to collapse "not approved yet" and "approved
// but the library was never created" into one false, so a user whose org
// provisioning failed was shown the invite-redemption screen with nothing to
// redeem. The three cases are now distinct.
describe("auth status", () => {
  afterEach(() => {
    invalidateAuthCache();
    getSession.mockReset();
  });

  it("is active when approved with a library", async () => {
    getSession.mockResolvedValue(session(true, "org-1"));

    const auth = await loadAuth();

    expect(auth?.status).toBe("active");
    expect(auth?.isAuthenticated).toBe(true);
    expect(auth?.orgId).toBe("org-1");
  });

  it("is unapproved when awaiting approval", async () => {
    getSession.mockResolvedValue(session(false, null));

    const auth = await loadAuth();

    expect(auth?.status).toBe("unapproved");
    expect(auth?.isAuthenticated).toBe(false);
    expect(auth?.orgId).toBeNull();
  });

  it("is org-pending when approved without a library", async () => {
    getSession.mockResolvedValue(session(true, null));

    const auth = await loadAuth();

    expect(auth?.status).toBe("org-pending");
    expect(auth?.isAuthenticated).toBe(false);
    expect(auth?.orgId).toBeNull();
  });

  it("stays unapproved even if a library exists", async () => {
    getSession.mockResolvedValue(session(false, "org-1"));

    const auth = await loadAuth();

    expect(auth?.status).toBe("unapproved");
    expect(auth?.orgId).toBeNull();
  });
});
