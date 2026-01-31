import useSWR from "swr";

import { type OrgFeatures } from "@/cf-worker/db/schema";
import { type MeResponse } from "@/types/api";

export type { OrgFeatures };

async function fetchMe(): Promise<MeResponse> {
  const res = await fetch("/api/auth/me");
  return res.json();
}

export function useOrgFeatures() {
  const { data } = useSWR("/api/auth/me", fetchMe);

  const features = data?.organization?.features ?? {};

  return {
    features,
    isChatEnabled: features.chatAgentEnabled ?? false,
    isAiSummaryEnabled: features.aiSummary ?? false,
  };
}
