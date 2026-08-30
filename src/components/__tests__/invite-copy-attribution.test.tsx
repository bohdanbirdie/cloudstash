// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InvitesTab } from "@/components/admin/invites-tab";
import { useInvitesAdmin } from "@/components/admin/use-invites-admin";
import { Tabs } from "@/components/ui/tabs";

// Regression: FE-10-A.
//
// use-invites-admin.ts tracks "was something copied" as a bare boolean flash
// flag. handleCopyCode receives the code, uses it for the clipboard write, and
// then sets a flag that carries no idea which code it was. invites-tab.tsx
// reads that one flag for the new-invite banner, while every available row
// also calls the same handler.
//
// So copying any row's code makes the banner claim the newly created code was
// copied. The confirmation is attached to the wrong value.

const OTHER_CODE = "OTHER-CODE";
const NEW_CODE = "NEW-CODE";

const invite = (id: string, code: string) => ({
  code,
  createdAt: new Date("2026-08-01T00:00:00Z"),
  createdBy: { email: "a@test.com", id: "u1", name: "Admin" },
  createdByUserId: "u1",
  expiresAt: null,
  id,
  usedAt: null,
  usedBy: null,
  usedByUserId: null,
});

function Harness() {
  const invites = useInvitesAdmin(true);

  return (
    <>
      <button type="button" onClick={() => invites.handleCopyCode(OTHER_CODE)}>
        Copy another code
      </button>
      <Tabs defaultValue="invites">
        <InvitesTab
          actionLoading={invites.actionLoading}
          copiedCode={invites.copiedCode}
          error={invites.error}
          invites={invites.invites}
          isCreating={invites.isCreating}
          isLoading={invites.isLoading}
          newInviteCode={invites.newInviteCode}
          onCopyCode={invites.handleCopyCode}
          onCreate={() => void invites.handleCreate()}
          onDelete={(id) => void invites.handleDelete(id)}
        />
      </Tabs>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("invite copy confirmation", () => {
  it("does not mark the new invite code as copied when another code is copied", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return {
            ok: true,
            json: async () => ({ code: NEW_CODE, expiresAt: null }),
          };
        }
        return {
          ok: true,
          json: async () => ({ invites: [invite("i1", OTHER_CODE)] }),
        };
      })
    );

    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Harness />
      </SWRConfig>
    );

    // Create an invite so the banner appears for NEW_CODE.
    fireEvent.click(screen.getByRole("button", { name: /Create Invite/ }));
    await waitFor(() => expect(screen.getByText(NEW_CODE)).toBeTruthy());
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();

    // Copy a different invite's code. The banner is about NEW_CODE, so it must
    // not change.
    fireEvent.click(screen.getByRole("button", { name: "Copy another code" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(OTHER_CODE));

    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy" })).toBeTruthy();
  });
});
