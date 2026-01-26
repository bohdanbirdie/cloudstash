import { useState, useCallback } from 'react'
import useSWR from 'swr'
import { authClient } from '@/lib/auth'
import { Route } from '@/routes/__root'

export interface ApiKey {
  id: string
  name: string | null
  createdAt: Date
  lastRequest: Date | null
}

async function fetchApiKeys(): Promise<ApiKey[]> {
  const result = await authClient.apiKey.list()
  if (result.error) {
    throw new Error(result.error.message || 'Failed to fetch API keys')
  }
  return result.data ?? []
}

export function useApiKeys(enabled = true) {
  const { auth } = Route.useRouteContext()
  const [isGenerating, setIsGenerating] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const { data: keys = [], error: fetchError, isLoading, mutate } = useSWR(
    enabled ? 'api-keys' : null,
    fetchApiKeys,
  )

  const error = mutationError || (fetchError?.message ?? null)

  const generateKey = useCallback(
    async (name: string): Promise<string | null> => {
      if (!auth.orgId) {
        setMutationError('No organization selected')
        return null
      }

      setIsGenerating(true)
      setMutationError(null)
      try {
        const result = await authClient.apiKey.create({
          name: name || 'API Key',
          metadata: {
            orgId: auth.orgId,
          },
        })
        if (result.error) {
          setMutationError(result.error.message || 'Failed to generate API key')
          return null
        }
        if (result.data?.key) {
          await mutate()
          return result.data.key
        }
        return null
      } catch (err) {
        setMutationError(err instanceof Error ? err.message : 'Failed to generate API key')
        return null
      } finally {
        setIsGenerating(false)
      }
    },
    [auth.orgId, mutate],
  )

  const revokeKey = useCallback(
    async (keyId: string) => {
      setMutationError(null)
      try {
        const result = await authClient.apiKey.delete({ keyId })
        if (result.error) {
          setMutationError(result.error.message || 'Failed to revoke API key')
          return
        }
        await mutate()
      } catch (err) {
        setMutationError(err instanceof Error ? err.message : 'Failed to revoke API key')
      }
    },
    [mutate],
  )

  const clearError = useCallback(() => setMutationError(null), [])

  return {
    keys,
    isLoading,
    error,
    isGenerating,
    fetchKeys: mutate,
    generateKey,
    revokeKey,
    clearError,
  }
}
