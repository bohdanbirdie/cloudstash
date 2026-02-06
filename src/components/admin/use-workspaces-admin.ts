import useSWR, { mutate } from "swr";
import useSWRMutation from "swr/mutation";

import { type WorkspaceWithOwner } from "@/cf-worker/admin/workspaces";
import { type OrgFeatures } from "@/cf-worker/db/schema";
import { type ApiErrorResponse } from "@/types/api";

export type { OrgFeatures };
export type Workspace = WorkspaceWithOwner;

interface WorkspacesListResponse {
  workspaces: Workspace[];
}

interface SettingsUpdateResponse {
  success: boolean;
  features: OrgFeatures;
}

async function fetchWorkspaces(): Promise<Workspace[]> {
  const res = await fetch("/api/admin/workspaces");
  const data = (await res.json()) as WorkspacesListResponse | ApiErrorResponse;
  if (!res.ok || "error" in data) {
    throw new Error(
      "error" in data ? data.error : "Failed to fetch workspaces"
    );
  }
  return data.workspaces;
}

async function updateOrgSettings(
  _: string,
  { arg }: { arg: { orgId: string; features: OrgFeatures } }
): Promise<SettingsUpdateResponse> {
  const res = await fetch(`/api/org/${arg.orgId}/settings`, {
    body: JSON.stringify({ features: arg.features }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  });
  const data = (await res.json()) as SettingsUpdateResponse | ApiErrorResponse;
  if (!res.ok || "error" in data) {
    throw new Error("error" in data ? data.error : "Failed to update settings");
  }
  mutate("admin-workspaces");
  mutate("/api/auth/me");
  return data;
}

export function useWorkspacesAdmin(enabled = true) {
  const {
    data: workspaces = [],
    error: fetchError,
    isLoading,
  } = useSWR(enabled ? "admin-workspaces" : null, fetchWorkspaces);

  const updateSettings = useSWRMutation(
    "update-org-settings",
    updateOrgSettings
  );

  const toggleAiSummary = (orgId: string, currentValue: boolean) => {
    const workspace = workspaces.find((w) => w.id === orgId);
    if (!workspace) return;

    updateSettings.trigger({
      orgId,
      features: {
        ...workspace.features,
        aiSummary: !currentValue,
      },
    });
  };

  const toggleChatAgent = (orgId: string, currentValue: boolean) => {
    const workspace = workspaces.find((w) => w.id === orgId);
    if (!workspace) return;

    updateSettings.trigger({
      orgId,
      features: {
        ...workspace.features,
        chatAgentEnabled: !currentValue,
      },
    });
  };

  const updateTokenBudget = (orgId: string, value: number) => {
    const workspace = workspaces.find((w) => w.id === orgId);
    if (!workspace) return;

    updateSettings.trigger({
      orgId,
      features: {
        ...workspace.features,
        monthlyTokenBudget: value,
      },
    });
  };

  const aiEnabledCount = workspaces.filter((w) => w.features.aiSummary).length;
  const chatEnabledCount = workspaces.filter(
    (w) => w.features.chatAgentEnabled
  ).length;

  return {
    aiEnabledCount,
    chatEnabledCount,
    error: updateSettings.error?.message ?? fetchError?.message ?? null,
    isLoading,
    isMutating: updateSettings.isMutating,
    toggleAiSummary,
    toggleChatAgent,
    updateTokenBudget,
    workspaces,
  };
}
