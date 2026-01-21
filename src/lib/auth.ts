import { createAuthClient } from 'better-auth/react'
import { jwtClient, organizationClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: window.location.origin,
  plugins: [jwtClient(), organizationClient()],
})

export type AuthState = {
  userId: string | null
  orgId: string | null
  jwt: string | null
  isAuthenticated: boolean
}

export const fetchAuth = async (): Promise<AuthState> => {
  const { data: session } = await authClient.getSession()

  if (!session?.user) {
    return { userId: null, orgId: null, jwt: null, isAuthenticated: false }
  }

  const { data: tokenData } = await authClient.token()

  return {
    userId: session.user.id,
    orgId: session.session.activeOrganizationId ?? null,
    jwt: tokenData?.token ?? null,
    isAuthenticated: !!tokenData?.token && !!session.session.activeOrganizationId,
  }
}
