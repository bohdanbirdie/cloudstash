import { useState, useCallback } from 'react'

import type {
  InviteWithRelations,
  InvitesListResponse,
  InviteCreateResponse,
  ApiErrorResponse,
} from '@/types/api'

export function useInvitesAdmin() {
  const [invites, setInvites] = useState<InviteWithRelations[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [newInviteCode, setNewInviteCode] = useState<string | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)

  const fetchInvites = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/invites')
      const data = (await res.json()) as InvitesListResponse | ApiErrorResponse
      if (!res.ok || 'error' in data) {
        setError('error' in data ? data.error : 'Failed to fetch invites')
        return
      }
      setInvites(data.invites)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch invites')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleCreate = useCallback(async () => {
    setIsCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = (await res.json()) as InviteCreateResponse | ApiErrorResponse
      if (!res.ok || 'error' in data) {
        setError('error' in data ? data.error : 'Failed to create invite')
        return
      }
      setNewInviteCode(data.code)
      await fetchInvites()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite')
    } finally {
      setIsCreating(false)
    }
  }, [fetchInvites])

  const handleDelete = useCallback(async (inviteId: string) => {
    setActionLoading(inviteId)
    try {
      const res = await fetch(`/api/invites/${inviteId}`, { method: 'DELETE' })
      const data = (await res.json()) as { success: boolean } | ApiErrorResponse
      if (!res.ok || 'error' in data) {
        setError('error' in data ? data.error : 'Failed to delete invite')
        return
      }
      await fetchInvites()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete invite')
    } finally {
      setActionLoading(null)
    }
  }, [fetchInvites])

  const handleCopyCode = useCallback(async (code: string) => {
    await navigator.clipboard.writeText(code)
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2000)
  }, [])

  const reset = useCallback(() => {
    setNewInviteCode(null)
    setCopiedCode(false)
  }, [])

  const availableCount = invites.filter((i) => getInviteStatus(i) === 'available').length

  return {
    invites,
    isLoading,
    error,
    isCreating,
    actionLoading,
    newInviteCode,
    copiedCode,
    fetchInvites,
    handleCreate,
    handleDelete,
    handleCopyCode,
    reset,
    availableCount,
  }
}

export function getInviteStatus(invite: InviteWithRelations) {
  if (invite.usedBy) return 'used'
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) return 'expired'
  return 'available'
}
