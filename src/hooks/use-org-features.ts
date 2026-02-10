import { toast } from "sonner";
import useSWR from "swr";

import { DEFAULT_MONTHLY_BUDGET } from "@/cf-worker/chat-agent/usage";
import { type OrgFeatures } from "@/cf-worker/db/schema";
import { type MeResponse } from "@/types/api";

export type { OrgFeatures };

async function fetchMe(): Promise<MeResponse> {
  const res = await fetch("/api/auth/me");
  if (res.status === 429) {
    toast.warning("Too many requests — please wait a moment");
    throw new Error("Rate limited");
  }
  if (!res.ok) {
    throw new Error(`/me failed: ${res.status}`);
  }
  return res.json();
}

export function useOrgFeatures() {
  const { data } = useSWR("/api/auth/me", fetchMe, {
    dedupingInterval: 30_000,
  });

  const features = data?.organization?.features ?? {};

  return {
    features,
    isChatEnabled: features.chatAgentEnabled ?? false,
    isAiSummaryEnabled: features.aiSummary ?? false,
    monthlyTokenBudget: features.monthlyTokenBudget ?? DEFAULT_MONTHLY_BUDGET,
  };
}
