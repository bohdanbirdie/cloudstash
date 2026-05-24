import { useRef, useState } from "react";

import type { ApiErrorResponse } from "@/types/api";

export type DigestTriggerOutcome =
  | { status: "generated"; period: string; linkCount: number }
  | { status: "skipped-empty"; period: string }
  | { status: "failed"; reason: string; message: string }
  | { status: "dropped-deletion" };

const parseJsonOrNull = async (
  res: Response
): Promise<DigestTriggerOutcome | ApiErrorResponse | null> => {
  try {
    return (await res.json()) as DigestTriggerOutcome | ApiErrorResponse;
  } catch {
    return null;
  }
};

export function useWeeklyDigestTrigger() {
  const [isTriggering, setIsTriggering] = useState(false);
  const inFlight = useRef(false);

  const trigger = async (): Promise<DigestTriggerOutcome> => {
    if (inFlight.current) {
      throw new Error("Digest trigger already in progress");
    }
    inFlight.current = true;
    setIsTriggering(true);
    try {
      const res = await fetch("/api/weekly-digest/trigger", {
        headers: { Accept: "application/json" },
        method: "POST",
      });
      const data = await parseJsonOrNull(res);
      if (!data) {
        throw new Error(
          `Trigger failed (${res.status} ${res.statusText || "no body"})`
        );
      }
      if (!res.ok || "error" in data) {
        throw new Error(
          "error" in data ? data.error : `Trigger failed (${res.status})`
        );
      }
      return data;
    } finally {
      inFlight.current = false;
      setIsTriggering(false);
    }
  };

  return { isTriggering, trigger };
}
