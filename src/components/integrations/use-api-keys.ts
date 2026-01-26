import { useState, useCallback } from 'react'
import { authClient } from '@/lib/auth'
import { Route } from '@/routes/__root'

export interface ApiKey {
  id: string
  name: string | null
  createdAt: Date
  lastRequest: Date | null
}

export function useApiKeys() {
  const { auth } = Route.useRouteContext()
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const fetchKeys = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await authClient.apiKey.list()
      if (result.error) {
        setError(result.error.message || 'Failed to fetch API keys')
        return
      }
      setKeys(result.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch API keys')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const generateKey = useCallback(
    async (name: string): Promise<string | null> => {
      if (!auth.orgId) {
        setError('No organization selected')
        return null
      }

      setIsGenerating(true)
      setError(null)
      try {
        const result = await authClient.apiKey.create({
          name: name || 'API Key',
          metadata: {
            orgId: auth.orgId,
          },
        })
        if (result.error) {
          setError(result.error.message || 'Failed to generate API key')
          return null
        }
        if (result.data?.key) {
          await fetchKeys()
          return result.data.key
        }
        return null
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate API key')
        return null
      } finally {
        setIsGenerating(false)
      }
    },
    [auth.orgId, fetchKeys],
  )

  const revokeKey = useCallback(
    async (keyId: string) => {
      try {
        const result = await authClient.apiKey.delete({ keyId })
        if (result.error) {
          setError(result.error.message || 'Failed to revoke API key')
          return
        }
        await fetchKeys()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to revoke API key')
      }
    },
    [fetchKeys],
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    keys,
    isLoading,
    error,
    isGenerating,
    fetchKeys,
    generateKey,
    revokeKey,
    clearError,
  }
}
