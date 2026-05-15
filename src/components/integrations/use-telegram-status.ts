import { useState } from "react";
import useSWR from "swr";

interface TelegramStatus {
  count: number;
  botUsername: string | null;
}

async function fetchTelegramStatus(): Promise<TelegramStatus> {
  const response = await fetch("/api/connect/telegram/status");
  if (!response.ok) {
    throw new Error("Failed to load Telegram status");
  }
  return response.json();
}

export function useTelegramStatus() {
  const { data, error, isLoading, mutate } = useSWR(
    "telegram-status",
    fetchTelegramStatus,
    { revalidateOnFocus: true }
  );
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const disconnect = async (): Promise<boolean> => {
    setIsDisconnecting(true);
    setDisconnectError(null);
    try {
      const response = await fetch("/api/connect/telegram", {
        method: "DELETE",
      });
      if (!response.ok) {
        const body: { error?: string } = await response.json();
        throw new Error(body.error || "Failed to disconnect");
      }
      await mutate();
      return true;
    } catch (err) {
      setDisconnectError(
        err instanceof Error ? err.message : "Failed to disconnect"
      );
      return false;
    } finally {
      setIsDisconnecting(false);
    }
  };

  return {
    count: data?.count ?? 0,
    isConnected: (data?.count ?? 0) > 0,
    botUsername: data?.botUsername ?? null,
    isLoading,
    error: disconnectError ?? (error instanceof Error ? error.message : null),
    disconnect,
    isDisconnecting,
    refresh: mutate,
  };
}
