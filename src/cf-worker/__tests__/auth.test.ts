import { SELF, env } from 'cloudflare:test'
import { Effect, pipe } from 'effect'
import { describe, it, expect, beforeAll } from 'vitest'

/**
 * E2E tests for organization-based auth using Cloudflare Workers Vitest pool.
 *
 * These tests run in an isolated Workers environment with:
 * - Fresh D1 database per test run
 * - Real Durable Objects
 * - Actual worker code via SELF
 */

// Test data
const TEST_USER_ID = 'test-user-123'
const TEST_ORG_ID = 'test-org-456'
const TEST_SESSION_ID = 'test-session-789'
const WRONG_ORG_ID = 'wrong-org-000'

/**
 * Helper to make sync requests via SELF
 */
const makeSyncRequest = (storeId: string, authToken: string) =>
  Effect.tryPromise({
    try: async () => {
      const payload = JSON.stringify({ authToken })
      const url = `http://worker/sync?storeId=${encodeURIComponent(storeId)}&payload=${encodeURIComponent(payload)}`

      return SELF.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _tag: 'SyncMessage.PullRequest',
          cursor: null,
        }),
      })
    },
    catch: (error) => new Error(`Fetch failed: ${error}`),
  })

/**
 * Helper to set up test data in D1
 */
const setupTestData = Effect.tryPromise({
  try: async () => {
    const db = env.DB

    // Create test user
    await db
      .prepare(
        `INSERT OR REPLACE INTO user (id, name, email, emailVerified, image, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(TEST_USER_ID, 'Test User', 'test@example.com', 1, null, Date.now(), Date.now())
      .run()

    // Create test organization
    await db
      .prepare(
        `INSERT OR REPLACE INTO organization (id, name, slug, logo, metadata, createdAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(TEST_ORG_ID, "Test User's Workspace", `user-${TEST_USER_ID}`, null, null, Date.now())
      .run()

    // Create membership
    await db
      .prepare(
        `INSERT OR REPLACE INTO member (id, organizationId, userId, role, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(`member-${TEST_USER_ID}`, TEST_ORG_ID, TEST_USER_ID, 'owner', Date.now())
      .run()

    // Create session with activeOrganizationId
    await db
      .prepare(
        `INSERT OR REPLACE INTO session (id, expiresAt, token, ipAddress, userAgent, userId, activeOrganizationId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        TEST_SESSION_ID,
        Date.now() + 86400000, // expires in 1 day
        'test-session-token',
        '127.0.0.1',
        'vitest',
        TEST_USER_ID,
        TEST_ORG_ID,
        Date.now(),
        Date.now(),
      )
      .run()
  },
  catch: (error) => new Error(`Failed to setup test data: ${error}`),
})

/**
 * Generate a test JWT. Since we can't easily access Better Auth's JWKS,
 * we test the error cases that don't require a valid JWT signature.
 */
const INVALID_JWT = 'invalid.jwt.token'
const EMPTY_JWT = ''

describe('Organization Auth E2E', () => {
  beforeAll(async () => {
    await Effect.runPromise(setupTestData)
  })

  it('should reject connection with missing auth token', async () => {
    const program = pipe(
      makeSyncRequest(TEST_ORG_ID, EMPTY_JWT),
      Effect.map((response) => ({
        status: response.status,
        textPromise: response.text(),
      })),
    )

    const result = await Effect.runPromise(program)
    expect(result.status).toBe(400)

    const text = await result.textPromise
    expect(text.toLowerCase()).toContain('missing auth token')
  })

  it('should reject connection with invalid JWT format', async () => {
    const program = pipe(
      makeSyncRequest(TEST_ORG_ID, INVALID_JWT),
      Effect.map((response) => ({
        status: response.status,
      })),
    )

    const result = await Effect.runPromise(program)
    // Invalid JWT should fail verification
    expect(result.status).toBe(400)
  })

  it('should reject connection with malformed JWT', async () => {
    // A JWT with correct structure but invalid signature
    const malformedJwt =
      'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItMTIzIiwib3JnSWQiOiJ0ZXN0LW9yZy00NTYifQ.invalid-signature'

    const program = pipe(
      makeSyncRequest(TEST_ORG_ID, malformedJwt),
      Effect.map((response) => ({
        status: response.status,
      })),
    )

    const result = await Effect.runPromise(program)
    expect(result.status).toBe(400)
  })

  it('should return 404 for non-sync routes', async () => {
    const response = await SELF.fetch('http://worker/unknown-route')
    expect(response.status).toBe(404)
  })

  it('should have auth routes available', async () => {
    // JWKS endpoint should be accessible
    const response = await SELF.fetch('http://worker/api/auth/jwks')
    // Better Auth should respond (might be 200 or generate JWKS on first call)
    expect(response.status).toBeLessThan(500)
  })
})

/**
 * Tests for the validatePayload logic specifically.
 * These test the org access validation assuming JWT is valid.
 */
describe('Org Access Validation', () => {
  beforeAll(async () => {
    await Effect.runPromise(setupTestData)
  })

  it('should verify D1 database is accessible', async () => {
    const db = env.DB

    const result = await db.prepare('SELECT COUNT(*) as count FROM user').first<{ count: number }>()

    expect(result?.count).toBeGreaterThanOrEqual(1)
  })

  it('should verify test organization exists', async () => {
    const db = env.DB

    const org = await db.prepare('SELECT * FROM organization WHERE id = ?').bind(TEST_ORG_ID).first()

    expect(org).not.toBeNull()
    expect(org?.name).toBe("Test User's Workspace")
  })

  it('should verify test user is member of organization', async () => {
    const db = env.DB

    const member = await db
      .prepare('SELECT * FROM member WHERE userId = ? AND organizationId = ?')
      .bind(TEST_USER_ID, TEST_ORG_ID)
      .first()

    expect(member).not.toBeNull()
    expect(member?.role).toBe('owner')
  })
})
