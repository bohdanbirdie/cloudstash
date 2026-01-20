import { createAuthClient } from 'better-auth/react'
import { jwtClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [jwtClient()],
})

export type AuthState = {
  userId: string | null
  jwt: string | null
  isAuthenticated: boolean
}

export const fetchAuth = async (): Promise<AuthState> => {
  const { data: session } = await authClient.getSession()

  if (!session?.user) {
    return { userId: null, jwt: null, isAuthenticated: false }
  }

  const { data: tokenData } = await authClient.token()

  return {
    userId: session.user.id,
    jwt: tokenData?.token ?? null,
    isAuthenticated: !!tokenData?.token,
  }
}
