# Admin UI & User Approval Spec

## Overview

Implement admin functionality using Better Auth's admin plugin to manage user approvals and provide an admin dashboard.

## Better Auth Admin Plugin

### Installation

The admin plugin is already available in Better Auth. Add it to the auth configuration:

```typescript
// src/cf-worker/auth/index.ts
import { admin } from 'better-auth/plugins'

export const createAuth = (env: Env, db: ReturnType<typeof createDb>) =>
  betterAuth({
    // ... existing config
    plugins: [
      // ... existing plugins
      admin({
        defaultRole: 'user',
        adminRole: 'admin',
      }),
    ],
  })
```

### Database Schema

Add `approved` field to user table and ensure role field exists:

```sql
-- migrations/0004_add_user_approval.sql
ALTER TABLE user ADD COLUMN approved INTEGER DEFAULT 0;
ALTER TABLE user ADD COLUMN role TEXT DEFAULT 'user';

-- Index for admin queries
CREATE INDEX idx_user_approved ON user(approved);
CREATE INDEX idx_user_role ON user(role);
```

## User Approval Flow

### 1. Registration Blocked for Unapproved Users

```typescript
// src/cf-worker/auth/index.ts
betterAuth({
  user: {
    additionalFields: {
      approved: {
        type: 'boolean',
        defaultValue: false,
        required: false,
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    async onUserCreated({ user }) {
      // New users start unapproved
      // Could send notification to admin here
    },
  },
})
```

### 2. Middleware to Block Unapproved Users

```typescript
// src/cf-worker/auth/middleware.ts
import { Effect } from 'effect'

export const requireApprovedUser = (auth: ReturnType<typeof createAuth>, request: Request) =>
  Effect.gen(function* () {
    const session = yield* Effect.tryPromise(() =>
      auth.api.getSession({ headers: request.headers }),
    )

    if (!session?.user) {
      return yield* Effect.fail(new UnauthorizedError({}))
    }

    if (!session.user.approved) {
      return yield* Effect.fail(new PendingApprovalError({}))
    }

    return session
  })
```

### 3. Frontend Handling

```tsx
// src/web/components/PendingApproval.tsx
export function PendingApproval() {
  return (
    <div className='flex flex-col items-center justify-center min-h-screen p-4'>
      <div className='text-center max-w-md'>
        <h1 className='text-2xl font-bold mb-4'>Pending Approval</h1>
        <p className='text-muted-foreground mb-4'>
          Your account is waiting for admin approval. You'll receive an email once approved.
        </p>
        <Button onClick={() => authClient.signOut()}>Sign Out</Button>
      </div>
    </div>
  )
}
```

## Admin API Endpoints

Better Auth admin plugin provides these endpoints:

| Endpoint                      | Method | Description                    |
| ----------------------------- | ------ | ------------------------------ |
| `/api/auth/admin/list-users`  | GET    | List all users with pagination |
| `/api/auth/admin/set-role`    | POST   | Set user role                  |
| `/api/auth/admin/ban-user`    | POST   | Ban a user                     |
| `/api/auth/admin/unban-user`  | POST   | Unban a user                   |
| `/api/auth/admin/remove-user` | POST   | Delete a user                  |

### Custom Approval Endpoint

```typescript
// src/cf-worker/routes/admin.ts
export const handleApproveUser = (request: Request, env: Env) =>
  Effect.gen(function* () {
    const auth = createAuth(env, createDb(env.DB))
    const session = yield* requireAdmin(auth, request)

    const { userId } = yield* Effect.tryPromise(() => request.json())

    yield* Effect.tryPromise(() =>
      env.DB.prepare('UPDATE user SET approved = 1 WHERE id = ?').bind(userId).run(),
    )

    // Optionally send approval email

    return new Response(JSON.stringify({ success: true }))
  })
```

## Admin UI Components

### Admin Dashboard Layout

```tsx
// src/web/routes/admin/index.tsx
export function AdminDashboard() {
  return (
    <div className='container mx-auto p-6'>
      <h1 className='text-3xl font-bold mb-6'>Admin Dashboard</h1>

      <Tabs defaultValue='pending'>
        <TabsList>
          <TabsTrigger value='pending'>Pending Approvals</TabsTrigger>
          <TabsTrigger value='users'>All Users</TabsTrigger>
          <TabsTrigger value='orgs'>Organizations</TabsTrigger>
        </TabsList>

        <TabsContent value='pending'>
          <PendingUsersTable />
        </TabsContent>
        <TabsContent value='users'>
          <UsersTable />
        </TabsContent>
        <TabsContent value='orgs'>
          <OrganizationsTable />
        </TabsContent>
      </Tabs>
    </div>
  )
}
```

### Pending Users Table

```tsx
// src/web/components/admin/PendingUsersTable.tsx
export function PendingUsersTable() {
  const { data: users, refetch } = useQuery({
    queryKey: ['admin', 'pending-users'],
    queryFn: () => fetch('/api/admin/pending-users').then((r) => r.json()),
  })

  const approveMutation = useMutation({
    mutationFn: (userId: string) =>
      fetch('/api/admin/approve-user', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    onSuccess: () => refetch(),
  })

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Registered</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users?.map((user) => (
          <TableRow key={user.id}>
            <TableCell>{user.email}</TableCell>
            <TableCell>{user.name}</TableCell>
            <TableCell>{formatDate(user.createdAt)}</TableCell>
            <TableCell>
              <Button size='sm' onClick={() => approveMutation.mutate(user.id)}>
                Approve
              </Button>
              <Button
                size='sm'
                variant='destructive'
                onClick={() => rejectMutation.mutate(user.id)}
              >
                Reject
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

## Route Protection

```tsx
// src/web/routes/admin/index.tsx
import { Navigate } from '@tanstack/react-router'

export function AdminRoute() {
  const { data: session } = useSession()

  if (!session?.user) {
    return <Navigate to='/login' />
  }

  if (session.user.role !== 'admin') {
    return <Navigate to='/' />
  }

  return <AdminDashboard />
}
```

## Implementation Checklist

- [ ] Add admin plugin to Better Auth config
- [ ] Create migration for approved and role fields
- [ ] Implement approval middleware
- [ ] Create pending approval UI for unapproved users
- [ ] Build admin dashboard route
- [ ] Implement pending users table with approve/reject
- [ ] Add users management table
- [ ] Add organizations overview
- [ ] Add route protection for admin pages
- [ ] Set up first admin user manually in DB
