import { describe, expect, it, vi } from "vitest";

import {
  consentPermissionDescriptions,
  consentRedirectTarget,
  loadConsentWorkspace,
} from "../oauth-consent";

describe("OAuth consent workspace loader", () => {
  it("uses only the server-selected active workspace in a multi-workspace context", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        organization: { id: "workspace-b", name: "Research" },
        organizations: [
          { id: "workspace-a", name: "Personal" },
          { id: "workspace-b", name: "Research" },
        ],
        session: { activeOrganizationId: "workspace-b" },
      })
    );

    await expect(loadConsentWorkspace(fetcher)).resolves.toEqual({
      ok: true,
      workspace: { id: "workspace-b" },
    });
    expect(fetcher).toHaveBeenCalledWith("/api/auth/me");
  });

  it("fails closed when the session has no active workspace", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        organization: null,
        session: { activeOrganizationId: null },
      })
    );

    await expect(loadConsentWorkspace(fetcher)).resolves.toEqual({
      ok: false,
      error: "Open your Cloudstash library before authorizing this MCP client.",
    });
  });

  it("rejects a response whose organization does not match the active workspace", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        organization: { id: "workspace-a", name: "Personal" },
        session: { activeOrganizationId: "workspace-b" },
      })
    );

    await expect(loadConsentWorkspace(fetcher)).resolves.toMatchObject({
      ok: false,
    });
  });

  it("turns network and JSON failures into a recoverable loader error", async () => {
    await expect(
      loadConsentWorkspace(vi.fn(() => Promise.reject(new Error("offline"))))
    ).resolves.toMatchObject({ ok: false });
    await expect(
      loadConsentWorkspace(
        vi.fn(async () => Response.json("not workspace data", { status: 200 }))
      )
    ).resolves.toMatchObject({ ok: false });
  });
});

describe("OAuth consent redirect display", () => {
  it("shows the callback host from the signed request", () => {
    expect(
      consentRedirectTarget(
        new URLSearchParams({
          redirect_uri: "http://127.0.0.1:6274/oauth/callback",
        })
      )
    ).toBe("127.0.0.1:6274");
  });

  it("shows a custom callback scheme and rejects malformed URLs", () => {
    expect(
      consentRedirectTarget(
        new URLSearchParams({ redirect_uri: "mcpjam://oauth/callback" })
      )
    ).toBe("mcpjam://oauth");
    expect(
      consentRedirectTarget(
        new URLSearchParams({ redirect_uri: "not a redirect" })
      )
    ).toBeNull();
  });
});

describe("OAuth consent permission copy", () => {
  it("combines MCP scopes into concise, plain-language permissions", () => {
    expect(
      consentPermissionDescriptions([
        "openid",
        "offline_access",
        "links:read",
        "links:write",
      ])
    ).toEqual(["View and manage links", "Stay connected until you disconnect"]);
  });

  it("keeps narrower grants accurate", () => {
    expect(consentPermissionDescriptions(["links:read"])).toEqual([
      "View links",
    ]);
    expect(consentPermissionDescriptions(["openid"])).toEqual([
      "Confirm your Cloudstash account",
    ]);
  });
});
