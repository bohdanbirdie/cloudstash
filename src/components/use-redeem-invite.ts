import { useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth'
import type { ApiErrorResponse } from '@/types/api'

export function useRedeemInvite() {
  const { refresh } = useAuth()
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const redeem = useCallback(
    async (code: string): Promise<boolean> => {
      if (!code.trim()) {
        setError('Please enter an invite code')
        return false
      }

      setIsRedeeming(true)
      setError(null)

      try {
        const res = await fetch('/api/invites/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code.trim() }),
        })
        const data = (await res.json()) as { success: boolean } | ApiErrorResponse

        if (!res.ok || 'error' in data) {
          setError('error' in data ? data.error : 'Failed to redeem invite')
          return false
        }

        await refresh()
        return true
      } catch {
        setError('Failed to redeem invite')
        return false
      } finally {
        setIsRedeeming(false)
      }
    },
    [refresh],
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    redeem,
    isRedeeming,
    error,
    clearError,
  }
}
