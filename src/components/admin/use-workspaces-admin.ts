import useSWR, { mutate } from "swr";
import useSWRMutation from "swr/mutation";

import type { WorkspaceWithOwner } from "@/cf-worker/admin/workspaces";
import type {
  CapabilityOverrides,
  PlanTier,
  TierCapabilities,
} from "@/lib/plan";
import type { ApiErrorResponse } from "@/types/api";

export type Workspace = WorkspaceWithOwner;

interface WorkspacesListResponse {
  workspaces: Workspace[];
}

async function fetchWorkspaces(): Promise<Workspace[]> {
  const res = await fetch("/api/admin/workspaces");
  const data: WorkspacesListResponse | ApiErrorResponse = await res.json();
  if (!res.ok || "error" in data) {
    throw new Error(
      "error" in data ? data.error : "Failed to fetch workspaces"
    );
  }
  return data.workspaces;
}

async function setTierRequest(
  _: string,
  { arg }: { arg: { orgId: string; tier: PlanTier } }
): Promise<void> {
  const res = await fetch(`/api/org/${arg.orgId}/tier`, {
    body: JSON.stringify({ tier: arg.tier }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  const data = (await res.json()) as ApiErrorResponse | { success: true };
  if (!res.ok || "error" in data) {
    throw new Error("error" in data ? data.error : "Failed to set tier");
  }
  void mutate("admin-workspaces");
  void mutate("/api/auth/me");
}

async function setOverrideRequest(
  _: string,
  {
    arg,
  }: {
    arg: {
      orgId: string;
      key: keyof TierCapabilities;
      value: TierCapabilities[keyof TierCapabilities] | null;
    };
  }
): Promise<void> {
  const res = await fetch(`/api/org/${arg.orgId}/overrides`, {
    body: JSON.stringify({ key: arg.key, value: arg.value }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  const data = (await res.json()) as ApiErrorResponse | { success: true };
  if (!res.ok || "error" in data) {
    throw new Error("error" in data ? data.error : "Failed to set override");
  }
  void mutate("admin-workspaces");
  void mutate("/api/auth/me");
}

export function useWorkspacesAdmin(enabled = true) {
  const {
    data: workspaces = [],
    error: fetchError,
    isLoading,
  } = useSWR(enabled ? "admin-workspaces" : null, fetchWorkspaces);

  const tierMutation = useSWRMutation("workspace-set-tier", setTierRequest);
  const overrideMutation = useSWRMutation(
    "workspace-set-override",
    setOverrideRequest
  );

  const setTier = (orgId: string, tier: PlanTier) =>
    void tierMutation.trigger({ orgId, tier });

  function setOverride<K extends keyof TierCapabilities>(
    orgId: string,
    key: K,
    value: TierCapabilities[K] | null
  ) {
    return void overrideMutation.trigger({ orgId, key, value });
  }

  /**
   * Three-state cycle for boolean caps: inherit → force-on → force-off → inherit.
   * Centralised so the table cells stay dumb.
   */
  function cycleBooleanOverride(
    orgId: string,
    overrides: CapabilityOverrides,
    key: Extract<
      keyof TierCapabilities,
      | "aiSummary"
      | "chatAgent"
      | "integrations"
      | "xBookmarkSync"
      | "xContentEnrichment"
      | "publicApi"
      | "mcpServer"
    >
  ): void {
    const current = overrides[key];
    const next = current === undefined ? true : current ? false : null;
    setOverride(orgId, key, next);
  }

  const tierCounts = workspaces.reduce(
    (acc, w) => {
      acc[w.tier] = (acc[w.tier] ?? 0) + 1;
      return acc;
    },
    { free: 0, plus: 0, pro: 0 } as Record<PlanTier, number>
  );

  const overrideCount = workspaces.filter(
    (w) => Object.keys(w.overrides).length > 0
  ).length;

  return {
    workspaces,
    isLoading,
    isMutating: tierMutation.isMutating || overrideMutation.isMutating,
    error:
      tierMutation.error?.message ??
      overrideMutation.error?.message ??
      fetchError?.message ??
      null,
    tierCounts,
    overrideCount,
    setTier,
    setOverride,
    cycleBooleanOverride,
  };
}
