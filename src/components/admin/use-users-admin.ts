import useSWR from 'swr'

import { authClient } from '@/lib/auth'
import type { AdminUser } from '@/types/api'

async function fetchUsers(): Promise<AdminUser[]> {
  const { data, error } = await authClient.admin.listUsers({
    query: {
      sortBy: 'createdAt',
      sortDirection: 'desc',
    },
  })
  if (error) {
    throw new Error(error.message || 'Failed to fetch users')
  }
  return (data?.users as AdminUser[]) ?? []
}

export function useUsersAdmin(enabled = true) {
  const { data: users = [], error, isLoading } = useSWR(
    enabled ? 'admin-users' : null,
    fetchUsers,
  )

  const pendingCount = users.filter((u) => !u.approved && !u.banned).length
  const activeCount = users.filter((u) => u.approved && !u.banned).length
  const adminCount = users.filter((u) => u.role === 'admin').length

  return {
    users,
    isLoading,
    error: error?.message ?? null,
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
