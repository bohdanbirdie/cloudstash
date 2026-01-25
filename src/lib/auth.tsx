import { createAuthClient } from 'better-auth/react'
import { adminClient, apiKeyClient, organizationClient } from 'better-auth/client/plugins'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'

import { RESET_FLAG_KEY } from '@/livestore/store'

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [organizationClient(), apiKeyClient(), adminClient()],
})

export type AuthState = {
  userId: string | null
  orgId: string | null
  isAuthenticated: boolean
  role: string | null
  approved: boolean
}

type AuthContextType = AuthState & {
  isLoading: boolean
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    userId: null,
    orgId: null,
    isAuthenticated: false,
    role: null,
    approved: false,
  })
  const [isLoading, setIsLoading] = useState(true)

  const updateAuthFromSession = useCallback(
    (session: Awaited<ReturnType<typeof authClient.getSession>>['data']) => {
      if (session?.user) {
        const user = session.user as typeof session.user & { approved?: boolean }
        const isApproved = user.approved ?? false

        setAuth({
          userId: user.id,
          orgId: isApproved ? (session.session.activeOrganizationId ?? null) : null,
          isAuthenticated: isApproved && !!session.session.activeOrganizationId,
          role: user.role ?? 'user',
          approved: isApproved,
        })
      }
    },
    [],
  )

  useEffect(() => {
    authClient.getSession().then(({ data: session }) => {
      updateAuthFromSession(session)
      setIsLoading(false)
    })
  }, [updateAuthFromSession])

  const logout = useCallback(async () => {
    try {
      localStorage.setItem(RESET_FLAG_KEY, 'true')
    } catch {
      // localStorage not available
    }
    await authClient.signOut()
    setAuth({
      userId: null,
      orgId: null,
      isAuthenticated: false,
      role: null,
      approved: false,
    })
  }, [])

  const refresh = useCallback(async () => {
    const { data: session } = await authClient.getSession()
    updateAuthFromSession(session)
  }, [updateAuthFromSession])

  return (
    <AuthContext.Provider value={{ ...auth, isLoading, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}
