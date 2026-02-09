import useSWR from "swr";

import { DEFAULT_MONTHLY_BUDGET } from "@/cf-worker/chat-agent/usage";
import { type OrgFeatures } from "@/cf-worker/db/schema";
import { type MeResponse } from "@/types/api";

export type { OrgFeatures };

async function fetchMe(): Promise<MeResponse> {
  const res = await fetch("/api/auth/me");
  if (!res.ok) {
    throw new Error(`/me failed: ${res.status}`);
  }
  return res.json();
}

export function useOrgFeatures() {
  const { data } = useSWR("/api/auth/me", fetchMe, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
    errorRetryCount: 2,
  });

  const features = data?.organization?.features ?? {};

  return {
    features,
    isChatEnabled: features.chatAgentEnabled ?? false,
    isAiSummaryEnabled: features.aiSummary ?? false,
    monthlyTokenBudget: features.monthlyTokenBudget ?? DEFAULT_MONTHLY_BUDGET,
  };
}
