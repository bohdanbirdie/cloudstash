import { useState, useCallback } from "react";
import useSWR from "swr";

import { authClient, useAuth } from "@/lib/auth";

export const INTEGRATION_SOURCES = [
  "chrome-extension",
  "raycast",
  "telegram",
] as const;
export type IntegrationSource = (typeof INTEGRATION_SOURCES)[number];

export interface ApiKey {
  id: string;
  name: string | null;
  createdAt: Date;
  lastRequest: Date | null;
  source: IntegrationSource | null;
}

const isIntegrationSource = (value: unknown): value is IntegrationSource =>
  typeof value === "string" &&
  INTEGRATION_SOURCES.includes(value as IntegrationSource);

const sourceFromName = (name: string | null): IntegrationSource | null => {
  if (name === "Chrome Extension") return "chrome-extension";
  if (name === "Raycast Extension" || name?.startsWith("Raycast — ")) {
    return "raycast";
  }
  if (name === "Telegram") return "telegram";
  return null;
};

export const resolveSource = (key: {
  name: string | null;
  metadata?: unknown;
}): IntegrationSource | null => {
  const metadata: unknown = key.metadata;
  if (metadata && typeof metadata === "object" && "source" in metadata) {
    const source: unknown = (metadata as { source: unknown }).source;
    if (isIntegrationSource(source)) return source;
  }
  return sourceFromName(key.name);
};

export const isIntegrationKey = (key: ApiKey): boolean => key.source !== null;

async function fetchApiKeys(): Promise<ApiKey[]> {
  const result = await authClient.apiKey.list();
  if (result.error) {
    throw new Error(result.error.message || "Failed to fetch API keys");
  }
  return (result.data?.apiKeys ?? []).map((key) => ({
    createdAt: key.createdAt,
    id: key.id,
    lastRequest: key.lastRequest,
    name: key.name,
    source: resolveSource(key),
  }));
}

export function useApiKeys(enabled = true) {
  const auth = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const {
    data: keys = [],
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR(enabled ? "api-keys" : null, fetchApiKeys, {
    revalidateOnFocus: true,
  });

  const error = mutationError || (fetchError?.message ?? null);

  const generateKey = useCallback(
    async (name: string): Promise<string | null> => {
      if (!auth.orgId) {
        setMutationError("Your library is unavailable");
        return null;
      }

      setIsGenerating(true);
      setMutationError(null);
      try {
        const result = await authClient.apiKey.create({
          name: name || "API Key",
        });
        if (result.error) {
          setMutationError(
            result.error.message || "Failed to generate API key"
          );
          return null;
        }
        if (result.data?.key) {
          await mutate();
          return result.data.key;
        }
        return null;
      } catch (err) {
        setMutationError(
          err instanceof Error ? err.message : "Failed to generate API key"
        );
        return null;
      } finally {
        setIsGenerating(false);
      }
    },
    [auth.orgId, mutate]
  );

  const revokeKey = useCallback(
    async (keyId: string): Promise<boolean> => {
      setMutationError(null);
      try {
        const result = await authClient.apiKey.delete({ keyId });
        if (result.error) {
          setMutationError(result.error.message || "Failed to revoke API key");
          return false;
        }
        await mutate();
        return true;
      } catch (err) {
        setMutationError(
          err instanceof Error ? err.message : "Failed to revoke API key"
        );
        return false;
      }
    },
    [mutate]
  );

  const clearError = useCallback(() => setMutationError(null), []);

  return {
    clearError,
    error,
    fetchKeys: mutate,
    generateKey,
    isGenerating,
    isLoading,
    keys,
    revokeKey,
  };
}
