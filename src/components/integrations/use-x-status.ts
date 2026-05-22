import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";

import { authClient } from "@/lib/auth";

interface XStatus {
  connected: boolean;
  xUsername?: string;
  status?: "active" | "needs_reconnect" | "paused" | "disconnected";
  syncEnabled?: boolean;
  lastSyncedAt?: number | null;
}

type MutatingAction = "connect" | "pause" | "resume" | "disconnect" | null;

// If the user starts the OAuth flow and either closes the popup, dismisses
// the account picker, or never returns to the tab, our `mutatingAction` would
// otherwise stay "connect" forever and disable every action until refresh.
// 60s is generous enough for the slowest legitimate redirect; if the user
// is still mid-flow they'll see the spinner long enough to know it didn't
// hang silently.
const CONNECT_LOCK_TIMEOUT_MS = 60_000;

async function fetchXStatus(): Promise<XStatus> {
  const response = await fetch("/api/connect/x/status");
  if (!response.ok) {
    throw new Error("Failed to load X status");
  }
  return response.json();
}

export function useXStatus() {
  const { data, error, isLoading, mutate } = useSWR("x-status", fetchXStatus, {
    revalidateOnFocus: true,
  });
  const [mutatingAction, setMutatingAction] = useState<MutatingAction>(null);
  const connectStartedAt = useRef<number | null>(null);

  // Recover from "user cancelled OAuth" cases. If the tab regains focus
  // after a long pause and we're still in "connect" state, clear the lock
  // so the user can retry — the server will revalidate via SWR's focus
  // refresh and resync the UI.
  useEffect(() => {
    if (mutatingAction !== "connect") return;
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const startedAt = connectStartedAt.current;
      if (startedAt && Date.now() - startedAt > 1500) {
        setMutatingAction(null);
        connectStartedAt.current = null;
      }
    };
    const timeoutId = window.setTimeout(() => {
      setMutatingAction(null);
      connectStartedAt.current = null;
    }, CONNECT_LOCK_TIMEOUT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearTimeout(timeoutId);
    };
  }, [mutatingAction]);

  const connect = async (): Promise<void> => {
    if (mutatingAction) return;
    setMutatingAction("connect");
    connectStartedAt.current = Date.now();
    try {
      await authClient.oauth2.link({
        providerId: "x",
        callbackURL: window.location.pathname,
      });
      // On success the browser navigates away. mutatingAction stays set
      // during the in-flight nav; the visibilitychange/timeout fallback
      // above clears it if the user cancels.
    } catch (err) {
      setMutatingAction(null);
      connectStartedAt.current = null;
      toast.error(err instanceof Error ? err.message : "Failed to start link");
    }
  };

  const callAction = async (
    action: Exclude<MutatingAction, null | "connect">,
    path: string,
    method: "POST" | "DELETE"
  ): Promise<boolean> => {
    if (mutatingAction) return false;
    setMutatingAction(action);
    try {
      const response = await fetch(path, { method });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `Request failed (${response.status})`);
      }
      await mutate();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
      return false;
    } finally {
      setMutatingAction(null);
    }
  };

  return {
    isConnected: data?.connected ?? false,
    xUsername: data?.xUsername ?? null,
    status: data?.status ?? null,
    syncEnabled: data?.syncEnabled ?? false,
    lastSyncedAt: data?.lastSyncedAt ?? null,
    isLoading,
    error: error instanceof Error ? error.message : null,
    mutatingAction,
    isMutating: mutatingAction !== null,
    connect,
    disconnect: () => callAction("disconnect", "/api/connect/x", "DELETE"),
    pause: () => callAction("pause", "/api/connect/x/pause", "POST"),
    resume: () => callAction("resume", "/api/connect/x/resume", "POST"),
    refresh: mutate,
  };
}
