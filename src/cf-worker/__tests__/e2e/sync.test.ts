import { SELF } from 'cloudflare:test'
import { describe, it, expect, beforeAll } from 'vitest'

/**
 * E2E tests for LiveStore sync connection auth rejection.
 *
 * Tests that the sync endpoint rejects WebSocket connections when:
 * - Session cookie is missing
 * - Session cookie is invalid
 * - User's orgId doesn't match the requested storeId
 */

type UserInfo = {
  cookie: string
  userId: string
  orgId: string
}

/**
 * Helper to signup a user and get their session info
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

  return {
    cookie,
    userId: me.user.id,
    orgId: me.session.activeOrganizationId,
  }
}

/**
 * Build sync URL for WebSocket connection
 */
const buildSyncUrl = (storeId: string) => {
  const params = new URLSearchParams({
    storeId,
    transport: 'ws',
  })
  return `http://worker/sync?${params.toString()}`
}

describe('Sync Connection Auth E2E', () => {
  let userA: UserInfo
  let userB: UserInfo

  beforeAll(async () => {
    userA = await signupUser('sync-user-a@test.com', 'Sync User A')
    userB = await signupUser('sync-user-b@test.com', 'Sync User B')
  })

  describe('Missing session cookie', () => {
    it('rejects sync request without cookie', async () => {
      const res = await SELF.fetch(buildSyncUrl(userA.orgId))

      expect(res.status).toBe(400)
      const text = await res.text()
      expect(text).toContain('Missing session cookie')
    })
  })

  describe('Invalid session cookie', () => {
    it('rejects sync request with invalid cookie', async () => {
      const res = await SELF.fetch(buildSyncUrl(userA.orgId), {
        headers: { Cookie: 'better-auth.session_token=invalid-session-token' },
      })

      expect(res.status).toBe(400)
      const text = await res.text()
      expect(text).toContain('Invalid or expired session')
    })

    it('rejects sync request with malformed cookie', async () => {
      const res = await SELF.fetch(buildSyncUrl(userA.orgId), {
        headers: { Cookie: 'not-a-valid-cookie' },
      })

      expect(res.status).toBe(400)
      const text = await res.text()
      expect(text).toContain('Invalid or expired session')
    })
  })

  describe('Org access control', () => {
    it('rejects when storeId does not match session orgId', async () => {
      // User A tries to sync with User B's org
      const res = await SELF.fetch(buildSyncUrl(userB.orgId), {
        headers: { Cookie: userA.cookie },
      })

      expect(res.status).toBe(400)
      const text = await res.text()
      expect(text).toContain('Access denied')
    })

    it('rejects when storeId is non-existent org', async () => {
      const res = await SELF.fetch(buildSyncUrl('non-existent-org-id'), {
        headers: { Cookie: userA.cookie },
      })

      expect(res.status).toBe(400)
      const text = await res.text()
      expect(text).toContain('Access denied')
    })
  })

  describe('Valid auth', () => {
    it('accepts sync request with valid cookie and matching storeId', async () => {
      const res = await SELF.fetch(buildSyncUrl(userA.orgId), {
        headers: { Cookie: userA.cookie },
      })

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
      const res = await SELF.fetch(buildSyncUrl(userB.orgId), {
        headers: { Cookie: userB.cookie },
      })

      expect(res.status).not.toBe(400)
    })

    it('User B cannot sync with User A org', async () => {
      const res = await SELF.fetch(buildSyncUrl(userA.orgId), {
        headers: { Cookie: userB.cookie },
      })

      expect(res.status).toBe(400)
      const text = await res.text()
      expect(text).toContain('Access denied')
    })
  })
})
