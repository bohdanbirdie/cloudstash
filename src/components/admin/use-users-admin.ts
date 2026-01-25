import { useState, useCallback } from 'react'

import { authClient } from '@/lib/auth'
import type { AdminUser } from '@/types/api'

export type ConfirmAction = {
  type: 'make-admin' | 'remove-admin'
  user: AdminUser
} | null

export function useUsersAdmin() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  const fetchUsers = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const { data, error } = await authClient.admin.listUsers({
        query: {
          sortBy: 'createdAt',
          sortDirection: 'desc',
        },
      })
      if (error) {
        setError(error.message || 'Failed to fetch users')
        return
      }
      setUsers((data?.users as AdminUser[]) ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handleApprove = useCallback(async (userId: string) => {
    setActionLoading(userId)
    try {
      const { error } = await authClient.admin.updateUser({
        userId,
        data: { approved: true },
      })
      if (error) throw new Error(error.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve user')
    } finally {
      setActionLoading(null)
    }
  }, [fetchUsers])

  const handleReject = useCallback(async (userId: string) => {
    setActionLoading(userId)
    try {
      const { error } = await authClient.admin.removeUser({ userId })
      if (error) throw new Error(error.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject user')
    } finally {
      setActionLoading(null)
    }
  }, [fetchUsers])

  const handleBan = useCallback(async (userId: string) => {
    setActionLoading(userId)
    try {
      const { error } = await authClient.admin.banUser({
        userId,
        banReason: 'Banned by admin',
      })
      if (error) throw new Error(error.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ban user')
    } finally {
      setActionLoading(null)
    }
  }, [fetchUsers])

  const handleUnban = useCallback(async (userId: string) => {
    setActionLoading(userId)
    try {
      const { error } = await authClient.admin.unbanUser({ userId })
      if (error) throw new Error(error.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unban user')
    } finally {
      setActionLoading(null)
    }
  }, [fetchUsers])

  const handleMakeAdmin = useCallback(async (userId: string) => {
    setActionLoading(userId)
    try {
      const { error } = await authClient.admin.setRole({ userId, role: 'admin' })
      if (error) throw new Error(error.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set admin role')
    } finally {
      setActionLoading(null)
    }
  }, [fetchUsers])

  const handleRemoveAdmin = useCallback(async (userId: string) => {
    setActionLoading(userId)
    try {
      const { error } = await authClient.admin.setRole({ userId, role: 'user' })
      if (error) throw new Error(error.message)
      await fetchUsers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove admin role')
    } finally {
      setActionLoading(null)
    }
  }, [fetchUsers])

  const handleConfirmAction = useCallback(async () => {
    if (!confirmAction) return
    const { type, user } = confirmAction
    setConfirmAction(null)
    if (type === 'make-admin') {
      await handleMakeAdmin(user.id)
    } else if (type === 'remove-admin') {
      await handleRemoveAdmin(user.id)
    }
  }, [confirmAction, handleMakeAdmin, handleRemoveAdmin])

  const pendingCount = users.filter((u) => !u.approved && !u.banned).length
  const activeCount = users.filter((u) => u.approved && !u.banned).length
  const adminCount = users.filter((u) => u.role === 'admin').length

  return {
    users,
    isLoading,
    error,
    actionLoading,
    confirmAction,
    setConfirmAction,
    fetchUsers,
    handleApprove,
    handleReject,
    handleBan,
    handleUnban,
    handleConfirmAction,
    pendingCount,
    activeCount,
    adminCount,
  }
}

export function getUserStatus(user: AdminUser) {
  if (user.banned) return 'banned'
  if (!user.approved) return 'pending'
  return 'active'
}
