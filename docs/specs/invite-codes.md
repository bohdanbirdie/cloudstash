# Invite Codes Spec

## Overview

Extend the existing admin approval system with one-time invite codes that allow users to skip the approval queue. Admins can generate invite codes that new users can redeem during/after signup to get auto-approved.

## Requirements

1. **Admins can create unlimited invite codes**
2. **Invite codes are one-time use** (single redemption)
3. **New users still see "approval needed" by default**
4. **Users with valid invite code get auto-approved**
5. **Invite codes have optional expiration**

## Plugin Options Considered

### Option A: `better-auth-invite` (Community Plugin)

A community plugin ([better-auth-invite](https://github.com/bard/better-auth-invite)) provides invite functionality:

**Pros:**

- Ready-made solution with invite/activate/signup flow
- Tracks who created and who used each invite
- Configurable code generation and duration

**Cons:**

- Works via **roles** (roleForSignupWithInvite vs roleForSignupWithoutInvite)
- Our current system uses `approved` boolean field, not roles
- Would require rearchitecting approval logic
- Cookie-based activation flow (user activates code, then signs up)

### Option B: Custom Implementation (Recommended)

Build a lightweight custom system that integrates with our existing `approved` field.

**Pros:**

- Integrates cleanly with existing approval system
- No external dependency
- Simpler flow: enter code on pending screen → get approved
- Full control over behavior

**Cons:**

- More implementation work
- Need to build admin UI for invite management

**Decision: Option B** - Custom implementation that works with existing `approved` field.

## Technical Design

### Database Schema

Add new `invite` table:

```typescript
// src/cf-worker/db/schema.ts
export const invite = sqliteTable('invite', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => nanoid()),
  code: text('code').notNull().unique(),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  usedByUserId: text('used_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  usedAt: integer('used_at', { mode: 'timestamp_ms' }),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
})

export const inviteRelations = relations(invite, ({ one }) => ({
  createdBy: one(user, {
    fields: [invite.createdByUserId],
    references: [user.id],
    relationName: 'createdInvites',
  }),
  usedBy: one(user, {
    fields: [invite.usedByUserId],
    references: [user.id],
    relationName: 'usedInvite',
  }),
}))
```

### Invite Code Format

- 8 characters, uppercase alphanumeric (excluding ambiguous: 0, O, I, L)
- Example: `ABCD1234`, `X7K9M2NP`
- Character set: `ABCDEFGHJKMNPQRSTUVWXYZ23456789`

### API Endpoints

#### Create Invite (Admin only)

```typescript
// POST /api/invites
// Body: { expiresInDays?: number }
// Response: { code: string, expiresAt: Date | null }

async function createInvite(req: Request, env: Env, db: Database, session: Session) {
  // Check admin role
  if (session.user.role !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  const { expiresInDays } = await req.json()
  const code = generateInviteCode()
  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null

  await db.insert(invite).values({
    code,
    createdByUserId: session.user.id,
    expiresAt,
  })

  return Response.json({ code, expiresAt })
}
```

#### Redeem Invite (Authenticated, unapproved users)

```typescript
// POST /api/invites/redeem
// Body: { code: string }
// Response: { success: boolean }

async function redeemInvite(req: Request, env: Env, db: Database, session: Session) {
  const { code } = await req.json()

  // Already approved
  if (session.user.approved) {
    return Response.json({ success: true })
  }

  // Find valid invite
  const inviteRecord = await db.query.invite.findFirst({
    where: and(
      eq(invite.code, code.toUpperCase()),
      isNull(invite.usedByUserId),
      or(isNull(invite.expiresAt), gt(invite.expiresAt, new Date())),
    ),
  })

  if (!inviteRecord) {
    return Response.json({ error: 'Invalid or expired invite code' }, { status: 400 })
  }

  // Mark invite as used and approve user
  await db.batch([
    db
      .update(invite)
      .set({ usedByUserId: session.user.id, usedAt: new Date() })
      .where(eq(invite.id, inviteRecord.id)),
    db.update(user).set({ approved: true }).where(eq(user.id, session.user.id)),
  ])

  return Response.json({ success: true })
}
```

#### List Invites (Admin only)

```typescript
// GET /api/invites
// Response: { invites: Invite[] }

async function listInvites(req: Request, env: Env, db: Database, session: Session) {
  if (session.user.role !== 'admin') {
    return new Response('Forbidden', { status: 403 })
  }

  const invites = await db.query.invite.findMany({
    with: { createdBy: true, usedBy: true },
    orderBy: [desc(invite.createdAt)],
  })

  return Response.json({ invites })
}
```

#### Delete Invite (Admin only)

```typescript
// DELETE /api/invites/:id
// Response: { success: boolean }
```

### Frontend Components

#### Updated PendingApproval Component

Add invite code input to the pending approval screen:

```tsx
// src/components/pending-approval.tsx
export function PendingApproval() {
  const { logout, refresh } = useAuth()
  const [code, setCode] = useState('')
  const [isRedeeming, setIsRedeeming] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRedeem = async () => {
    setIsRedeeming(true)
    setError(null)
    try {
      const res = await fetch('/api/invites/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to redeem invite')
        return
      }
      // Refresh auth state to pick up approval
      await refresh()
    } catch (err) {
      setError('Failed to redeem invite')
    } finally {
      setIsRedeeming(false)
    }
  }

  return (
    <div className='flex min-h-screen items-center justify-center p-4 bg-muted/30'>
      <Card className='max-w-md'>
        <CardContent className='pt-6 text-center'>
          <ClockIcon className='mx-auto h-12 w-12 text-yellow-500 mb-4' />
          <h1 className='text-xl font-semibold mb-2'>Account Pending Approval</h1>
          <p className='text-muted-foreground mb-6'>
            Your account is waiting for admin approval. You'll be able to access the app once
            approved.
          </p>

          {/* Invite code section */}
          <div className='border-t pt-4 mt-4'>
            <p className='text-sm text-muted-foreground mb-3'>Have an invite code?</p>
            <div className='flex gap-2'>
              <Input
                placeholder='Enter code'
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                maxLength={8}
                className='font-mono text-center tracking-widest'
              />
              <Button onClick={handleRedeem} disabled={!code || isRedeeming}>
                {isRedeeming ? <Spinner className='size-4' /> : 'Redeem'}
              </Button>
            </div>
            {error && <p className='text-sm text-red-500 mt-2'>{error}</p>}
          </div>

          <Button variant='outline' onClick={handleSignOut} className='mt-6'>
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
```

#### Invite Management in Admin Modal

Add invite management tab/section to the admin modal:

```tsx
// In admin-modal.tsx, add Invites tab

interface Invite {
  id: string
  code: string
  createdBy: { name: string; email: string }
  usedBy: { name: string; email: string } | null
  usedAt: Date | null
  expiresAt: Date | null
  createdAt: Date
}

// State
const [invites, setInvites] = useState<Invite[]>([])
const [showInvites, setShowInvites] = useState(false)

// Create invite
const handleCreateInvite = async (expiresInDays?: number) => {
  const res = await fetch('/api/invites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresInDays }),
  })
  const data = await res.json()
  // Show code to admin, refresh list
  setNewInviteCode(data.code)
  await fetchInvites()
}

// Delete invite
const handleDeleteInvite = async (inviteId: string) => {
  await fetch(`/api/invites/${inviteId}`, { method: 'DELETE' })
  await fetchInvites()
}

// UI: Tab to switch between Users and Invites
// Invites list showing: code, created by, status (available/used/expired), actions
```

## User Flows

### Flow 1: Admin Creates Invite Code

```
1. Admin opens Admin modal
2. Admin clicks "Invites" tab
3. Admin clicks "Create Invite" button
4. Modal shows options: expiration (optional)
5. Admin confirms
6. System generates code (e.g., "X7K9M2NP")
7. Code displayed with copy button
8. Admin shares code with user (email, message, etc.)
```

### Flow 2: New User Signs Up Without Invite

```
1. User visits app → redirected to /login
2. User clicks "Continue with Google"
3. OAuth completes → user created with approved=false
4. User sees PendingApproval screen
5. User has no invite code → waits for admin approval
```

### Flow 3: New User Redeems Invite Code

```
1. User signs up (same as Flow 2)
2. User sees PendingApproval screen
3. User enters invite code received from admin
4. System validates code:
   - Not already used
   - Not expired
5. If invalid: show error message
6. System marks invite as used (links to user)
7. System sets user.approved = true
8. User's auth state refreshes
9. User sees main app
```

### Flow 4: Admin Views Invite Status

```
1. Admin opens Admin modal → Invites tab
2. Admin sees list of all invites:
   - Code: X7K9M2NP
   - Created by: Admin Name
   - Status: Used by John Doe on Jan 25
   - or: Available (expires in 7 days)
   - or: Expired
3. Admin can delete unused invites
```

## Implementation Checklist

### Database

- [ ] Add `invite` table to schema
- [ ] Add relations for invite
- [ ] Generate Drizzle migration
- [ ] Run migration locally
- [ ] Run migration remotely (when ready)

### API Endpoints

- [ ] POST `/api/invites` - Create invite (admin only)
- [ ] GET `/api/invites` - List invites (admin only)
- [ ] DELETE `/api/invites/:id` - Delete invite (admin only)
- [ ] POST `/api/invites/redeem` - Redeem invite (authenticated)

### Frontend

- [ ] Update `PendingApproval` with invite code input
- [ ] Add `refresh()` method to AuthProvider
- [ ] Add Invites tab to Admin modal
- [ ] Create invite dialog with expiration options
- [ ] Invite list with status badges
- [ ] Copy code button
- [ ] Delete invite action

### Testing

- [ ] Admin can create invite
- [ ] Generated code is valid format
- [ ] Non-admin cannot create invites
- [ ] Unapproved user can redeem valid invite
- [ ] User gets approved after redeem
- [ ] Used invite cannot be redeemed again
- [ ] Expired invite cannot be redeemed
- [ ] Admin can see invite usage
- [ ] Admin can delete unused invite

## Files to Create/Modify

| File                                  | Changes                                |
| ------------------------------------- | -------------------------------------- |
| `src/cf-worker/db/schema.ts`          | Add `invite` table and relations       |
| `src/cf-worker/api/invites.ts`        | New file: invite API handlers          |
| `src/cf-worker/index.ts`              | Register invite API routes             |
| `src/lib/auth.tsx`                    | Add `refresh()` method to AuthProvider |
| `src/components/pending-approval.tsx` | Add invite code redemption UI          |
| `src/components/admin-modal.tsx`      | Add Invites tab with management UI     |

## Security Considerations

1. **Invite codes are admin-only** - Only users with `role: 'admin'` can create/view/delete invites
2. **One-time use** - Each invite can only be used once, enforced by `usedByUserId` check
3. **Optional expiration** - Invites can have expiration dates for time-limited access
4. **Code entropy** - 8 chars from 32-char set = ~1.1 trillion combinations
5. **Rate limiting** - Consider adding in future (see `docs/future-plans.md`)

## Sources

- [better-auth-invite](https://github.com/bard/better-auth-invite) - Community plugin (not used, but referenced for design)
- [Better Auth Organization Plugin](https://www.better-auth.com/docs/plugins/organization) - Built-in invitation for orgs
- [Invitation workflow issue](https://github.com/better-auth/better-auth/issues/4223) - Feature discussion
