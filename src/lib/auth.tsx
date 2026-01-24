import { createAuthClient } from 'better-auth/react'
import { apiKeyClient, organizationClient } from 'better-auth/client/plugins'
import { createContext, useContext, useState, useEffect, useCallback } from 'react'

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [organizationClient(), apiKeyClient()],
})

export type AuthState = {
  userId: string | null
  orgId: string | null
  isAuthenticated: boolean
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
  })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    authClient.getSession().then(({ data: session }) => {
      if (session?.user) {
        setAuth({
          userId: session.user.id,
          orgId: session.session.activeOrganizationId ?? null,
          isAuthenticated: !!session.session.activeOrganizationId,
        })
      }
      setIsLoading(false)
    })
  }, [])

  const logout = useCallback(async () => {
    await authClient.signOut()
    setAuth({ userId: null, orgId: null, isAuthenticated: false })
  }, [])

  return (
    <AuthContext.Provider value={{ ...auth, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
