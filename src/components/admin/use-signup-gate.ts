import { useState } from "react";
import useSWR from "swr";

import type { ApiErrorResponse } from "@/types/api";

interface SignupGateResponse {
  enabled: boolean;
}

async function fetchSignupGate(): Promise<boolean> {
  const res = await fetch("/api/admin/signup-gate");
  const data: SignupGateResponse | ApiErrorResponse = await res.json();
  if (!res.ok || "error" in data) {
    throw new Error("error" in data ? data.error : "Failed to load setting");
  }
  return data.enabled;
}

export function useSignupGate(enabled = true) {
  const {
    data: gateEnabled,
    error,
    isLoading,
    mutate,
  } = useSWR(enabled ? "admin-signup-gate" : null, fetchSignupGate);

  const [isSaving, setIsSaving] = useState(false);

  const setGateEnabled = async (next: boolean) => {
    const previous = gateEnabled;
    setIsSaving(true);
    void mutate(next, { revalidate: false });
    try {
      const res = await fetch("/api/admin/signup-gate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data: SignupGateResponse | ApiErrorResponse = await res.json();
      if (!res.ok || "error" in data) {
        throw new Error(
          "error" in data ? data.error : "Failed to save setting"
        );
      }
      void mutate(data.enabled, { revalidate: false });
    } catch (err) {
      void mutate(previous, { revalidate: false });
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    gateEnabled,
    isLoading,
    isSaving,
    error: error?.message ?? null,
    setGateEnabled,
  };
}
