import useSWR, { mutate } from "swr";
import useSWRMutation from "swr/mutation";

import { type ApiErrorResponse } from "@/types/api";

export type OrgFeatures = {
  aiSummary?: boolean;
};

export interface Workspace {
  id: string;
  name: string;
  slug: string | null;
  creatorEmail: string | null;
  features: OrgFeatures;
}

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

  const aiEnabledCount = workspaces.filter((w) => w.features.aiSummary).length;

  return {
    aiEnabledCount,
    error: updateSettings.error?.message ?? fetchError?.message ?? null,
    isLoading,
    isMutating: updateSettings.isMutating,
    toggleAiSummary,
    workspaces,
  };
}
