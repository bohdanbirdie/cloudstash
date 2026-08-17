import { describe, expect, it, vi } from "vitest";

import { loadConsentWorkspace } from "../oauth-consent";

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
      workspace: { id: "workspace-b", name: "Research" },
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
      error: "Select an active workspace before authorizing this MCP client.",
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
});
