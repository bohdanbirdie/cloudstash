import { toast } from "sonner";
import useSWR from "swr";

import { capabilitiesFor } from "@/lib/plan";
import type { MeResponse } from "@/types/api";

class RateLimitedError extends Error {
  constructor() {
    super("Rate limited");
    this.name = "RateLimitedError";
  }
}

async function fetchMe(): Promise<MeResponse> {
  const res = await fetch("/api/auth/me");
  if (res.status === 429) {
    throw new RateLimitedError();
  }
  if (!res.ok) {
    throw new Error(`/me failed: ${res.status}`);
  }
  const data: MeResponse = await res.json();
  return data;
}

const FREE_CAPS = capabilitiesFor("free");

export function useOrgFeatures() {
  const { data, error } = useSWR("/api/auth/me", fetchMe, {
    dedupingInterval: 30_000,
    onError: (err: unknown) => {
      if (err instanceof RateLimitedError) {
        toast.warning("Too many requests — please wait a moment", {
          id: "me-rate-limited",
        });
      }
    },
  });

  const capabilities = data?.organization?.capabilities ?? FREE_CAPS;
  const tier = data?.organization?.tier ?? "free";

  const isLoading = data === undefined && error === undefined;
  const isFallback = data === undefined && error !== undefined;

  return {
    capabilities,
    tier,
    error: error ?? null,
    isLoading,
    isFallback,
    isChatEnabled: capabilities.chatAgent,
    isAiSummaryEnabled: capabilities.aiSummary,
    monthlyChatBudgetUsd: capabilities.monthlyChatBudgetUsd,
  };
}
