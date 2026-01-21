import { SELF } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'

/**
 * E2E tests for LiveStore sync connection auth rejection.
 *
 * Tests that the sync endpoint rejects WebSocket connections when:
 * - Auth token is missing
 * - Auth token is invalid
 * - User's orgId doesn't match the requested storeId
 */

type UserInfo = {
  cookie: string
  userId: string
  orgId: string
  jwt: string
}

/**
 * Helper to signup a user and get their session info + JWT
 */
const signupUser = async (email: string, name: string): Promise<UserInfo> => {
  const res = await SELF.fetch('http://worker/api/auth/sign-up/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'test-password-123', name }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Signup failed: ${res.status} - ${text}`)
  }

  const cookie = res.headers.get('set-cookie')
  if (!cookie) {
    throw new Error('No session cookie returned from signup')
  }

  // Get user info including orgId via /me endpoint
  const meRes = await SELF.fetch('http://worker/api/auth/me', {
    headers: { Cookie: cookie },
  })

  if (!meRes.ok) {
    const text = await meRes.text()
    throw new Error(`Failed to get /me: ${meRes.status} - ${text}`)
  }

  const me = (await meRes.json()) as {
    user: { id: string }
    session: { activeOrganizationId: string }
  }

  // Get JWT token
  const tokenRes = await SELF.fetch('http://worker/api/auth/token', {
    headers: { Cookie: cookie },
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    throw new Error(`Failed to get token: ${tokenRes.status} - ${text}`)
  }

  const tokenData = (await tokenRes.json()) as { token: string }

  return {
    cookie,
    userId: me.user.id,
    orgId: me.session.activeOrganizationId,
    jwt: tokenData.token,
  }
}

/**
 * Build sync URL with optional payload
 */
const buildSyncUrl = (storeId: string, payload?: { authToken: string }) => {
  const params = new URLSearchParams({
    storeId,
    transport: 'ws',
  })
  if (payload) {
    params.set('payload', JSON.stringify(payload))
  }
  return `http://worker/sync?${params.toString()}`
}

describe('Sync Connection Auth E2E', () => {
  let userA: UserInfo
  let userB: UserInfo

  beforeAll(async () => {
    userA = await signupUser('sync-user-a@test.com', 'Sync User A')
    userB = await signupUser('sync-user-b@test.com', 'Sync User B')
  })

  describe('Missing auth token', () => {
    it('rejects sync request without payload', async () => {
      const res = await SELF.fetch(buildSyncUrl(userA.orgId))

      expect(res.status).toBe(400)
      const text = await res.text()
      // Schema validation fails before validatePayload runs
      expect(text).toContain('authToken')
    })

    it('rejects sync request with empty payload', async () => {
      const url = `http://worker/sync?storeId=${userA.orgId}&transport=ws&payload=${encodeURIComponent('{}')}`
      const res = await SELF.fetch(url)

      expect(res.status).toBe(400)
      const text = await res.text()
      // Schema validation fails before validatePayload runs
      expect(text).toContain('authToken')
      expect(text).toContain('is missing')
    })
  })

  describe('Invalid auth token', () => {
    it('rejects sync request with malformed JWT', async () => {
      const res = await SELF.fetch(
        buildSyncUrl(userA.orgId, { authToken: 'not-a-valid-jwt' }),
      )

      expect(res.status).toBe(400)
    })

    it('rejects sync request with expired/invalid JWT signature', async () => {
      // Create a fake JWT with invalid signature
      const fakeJwt =
        'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.invalid_signature'
      const res = await SELF.fetch(
        buildSyncUrl(userA.orgId, { authToken: fakeJwt }),
      )

      expect(res.status).toBe(400)
    })
  })

  describe('Org access control', () => {
    it('rejects when storeId does not match JWT orgId', async () => {
      // User A tries to sync with User B's org
      const res = await SELF.fetch(
        buildSyncUrl(userB.orgId, { authToken: userA.jwt }),
      )

      expect(res.status).toBe(400)
      const text = await res.text()
      expect(text).toContain('Access denied')
    })

    it('rejects when storeId is non-existent org', async () => {
      const res = await SELF.fetch(
        buildSyncUrl('non-existent-org-id', { authToken: userA.jwt }),
      )

      expect(res.status).toBe(400)
      const text = await res.text()
      expect(text).toContain('Access denied')
    })
  })

  describe('Valid auth', () => {
    it('accepts sync request with valid JWT and matching storeId', async () => {
      const res = await SELF.fetch(
        buildSyncUrl(userA.orgId, { authToken: userA.jwt }),
      )

      // Should return 101 Switching Protocols (WebSocket upgrade)
      // or potentially a different success status depending on how SELF handles WebSocket
      // The key is it should NOT be 400
      expect(res.status).not.toBe(400)
    })
  })

  describe('Cross-user isolation', () => {
    it('User A and B have different orgs', () => {
      expect(userA.orgId).not.toBe(userB.orgId)
    })

    it('User B can sync with their own org', async () => {
      const res = await SELF.fetch(
        buildSyncUrl(userB.orgId, { authToken: userB.jwt }),
      )

      expect(res.status).not.toBe(400)
    })

    it('User B cannot sync with User A org', async () => {
      const res = await SELF.fetch(
        buildSyncUrl(userA.orgId, { authToken: userB.jwt }),
      )

      expect(res.status).toBe(400)
      const text = await res.text()
      expect(text).toContain('Access denied')
    })
  })
})
