import { createAuthClient } from 'better-auth/react'
import { adminClient, apiKeyClient, organizationClient } from 'better-auth/client/plugins'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'

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

  useEffect(() => {
    authClient.getSession().then(({ data: session }) => {
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
      setIsLoading(false)
    })
  }, [])

  const logout = useCallback(async () => {
    await authClient.signOut()
    setAuth({
      userId: null,
      orgId: null,
      isAuthenticated: false,
      role: null,
      approved: false,
    })
  }, [])

  return (
    <AuthContext.Provider value={{ ...auth, isLoading, logout }}>{children}</AuthContext.Provider>
  )
}
