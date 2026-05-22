import { toast } from "sonner";

import type { PlanTier } from "@/lib/plan";

interface BillingUrlResponse {
  url?: string;
  error?: string;
}

async function openBillingUrl(path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as BillingUrlResponse;
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Billing request failed");
  }
  window.location.href = data.url;
}

export async function changePlan(
  target: PlanTier,
  currentTier: PlanTier
): Promise<void> {
  try {
    if (currentTier === "free" && target !== "free") {
      await openBillingUrl("/api/billing/checkout", { tier: target });
    } else {
      await openBillingUrl("/api/billing/portal", { tier: target });
    }
  } catch (err) {
    toast.error("Couldn’t open billing", {
      description: err instanceof Error ? err.message : "Please try again.",
    });
    throw err;
  }
}
