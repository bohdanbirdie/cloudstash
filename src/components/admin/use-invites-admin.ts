import { useState, useCallback } from "react";
import useSWR from "swr";

import {
  type InviteWithRelations,
  type InvitesListResponse,
  type InviteCreateResponse,
  type ApiErrorResponse,
} from "@/types/api";

async function fetchInvites(): Promise<InviteWithRelations[]> {
  const res = await fetch("/api/invites");
  const data = (await res.json()) as InvitesListResponse | ApiErrorResponse;
  if (!res.ok || "error" in data) {
    throw new Error("error" in data ? data.error : "Failed to fetch invites");
  }
  return data.invites;
}

export function useInvitesAdmin(enabled = true) {
  const [isCreating, setIsCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [newInviteCode, setNewInviteCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const {
    data: invites = [],
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR(enabled ? "admin-invites" : null, fetchInvites);

  const error = mutationError || (fetchError?.message ?? null);

  const handleCreate = useCallback(async () => {
    setIsCreating(true);
    setMutationError(null);
    try {
      const res = await fetch("/api/invites", {
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const data = (await res.json()) as
        | InviteCreateResponse
        | ApiErrorResponse;
      if (!res.ok || "error" in data) {
        setMutationError(
          "error" in data ? data.error : "Failed to create invite"
        );
        return;
      }
      setNewInviteCode(data.code);
      await mutate();
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Failed to create invite"
      );
    } finally {
      setIsCreating(false);
    }
  }, [mutate]);

  const handleDelete = useCallback(
    async (inviteId: string) => {
      setActionLoading(inviteId);
      setMutationError(null);
      try {
        const res = await fetch(`/api/invites/${inviteId}`, {
          method: "DELETE",
        });
        const data = (await res.json()) as
          | { success: boolean }
          | ApiErrorResponse;
        if (!res.ok || "error" in data) {
          setMutationError(
            "error" in data ? data.error : "Failed to delete invite"
          );
          return;
        }
        await mutate();
      } catch (error) {
        setMutationError(
          error instanceof Error ? error.message : "Failed to delete invite"
        );
      } finally {
        setActionLoading(null);
      }
    },
    [mutate]
  );

  const handleCopyCode = useCallback(async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }, []);

  const reset = useCallback(() => {
    setNewInviteCode(null);
    setCopiedCode(false);
  }, []);

  const availableCount = invites.filter(
    (i) => getInviteStatus(i) === "available"
  ).length;

  return {
    actionLoading,
    availableCount,
    copiedCode,
    error,
    fetchInvites: mutate,
    handleCopyCode,
    handleCreate,
    handleDelete,
    invites,
    isCreating,
    isLoading,
    newInviteCode,
    reset,
  };
}

export function getInviteStatus(invite: InviteWithRelations) {
  if (invite.usedBy) {
    return "used";
  }
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return "expired";
  }
  return "available";
}
