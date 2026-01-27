# Admin UI & User Approval Spec

## Overview

Implement admin functionality using Better Auth's admin plugin to:

1. Block unapproved users from accessing the app
2. Provide a simple admin UI to approve/reject/ban users
3. Bootstrap the first admin user

## Key Architecture Notes

- **Auth**: Cookies-based (no JWT), uses React Context (`AuthProvider` + `useAuth()` hook)
- **Approval mechanism**: Uses `additionalFields` to add `approved: boolean` field to users
- **Ban system**: Preserved for actual bans (Better Auth handles redirect to error page)
- **First admin**: Set manually via wrangler command (no auto-bootstrap)
- **Admin UI**: Modal dialog in sidebar (not a separate route)
- **Pending users**: See `PendingApproval` screen rendered in `main.tsx` before router
- **Package manager**: bun (not pnpm)

## Why Not Use Ban System for Approval?

Better Auth's ban system blocks users from logging in entirely, redirecting them to `/api/auth/error`. This is correct behavior for actual bans, but not for pending approval where we want users to:

1. Log in successfully
2. See a custom "pending approval" screen
3. Have their session preserved

Therefore, we use a separate `approved` field for the approval workflow.

## Better Auth Features Used

### Admin Plugin

The admin plugin provides:

- **User management**: `listUsers`, `updateUser`, `removeUser`
- **Role system**: `setRole` (default roles: `user`, `admin`)
- **Ban system**: `banUser`, `unbanUser` (for actual bans)

### Additional Fields

Better Auth's `additionalFields` feature allows adding custom fields to users:

```typescript
user: {
  additionalFields: {
    approved: {
      type: "boolean",
      required: false,
      defaultValue: false,
      input: false, // users can't set this themselves
    },
  },
}
```

This field is:

- Automatically added to the database schema
- Included in session responses (`session.user.approved`)
- Type-safe throughout the application

## Implementation

### 1. Add Approved Field via additionalFields

```typescript
// src/cf-worker/auth/index.ts
import { betterAuth } from "better-auth";
import { admin, apiKey, organization } from "better-auth/plugins";

export const createAuth = (env: Env, db: Database) => {
  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    user: {
      additionalFields: {
        approved: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
      },
    },
    plugins: [
      organization({
        allowUserToCreateOrganization: true,
        creatorRole: "owner",
      }),
      apiKey({
        defaultPrefix: "lb",
        enableMetadata: true,
        rateLimit: {
          enabled: true,
          timeWindow: 1000 * 60 * 60 * 24,
          maxRequests: 100,
        },
      }),
      admin({
        defaultRole: "user",
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // No need to set approved: false - it's the default
            // Just create personal workspace
            try {
              const result = await auth.api.createOrganization({
                body: {
                  name: `${user.name}'s Workspace`,
                  slug: `user-${user.id}`,
                  userId: user.id,
                },
              });
              logger.info("Created organization", {
                orgId: result?.id,
                userId: user.id,
              });
            } catch (error) {
              logger.error("Failed to create organization", {
                userId: user.id,
                error: String(error),
              });
              throw error;
            }
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const membership = await db.query.member.findFirst({
              where: eq(schema.member.userId, session.userId),
            });
            return {
              data: {
                ...session,
                activeOrganizationId: membership?.organizationId ?? null,
              },
            };
          },
        },
      },
    },
    // ... rest of config
  });

  return auth;
};
```

### 2. Update Drizzle Schema

Add the `approved` field to the user table:

```typescript
// src/cf-worker/db/schema.ts
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .default(false)
    .notNull(),
  image: text("image"),
  // Admin plugin fields
  role: text("role").default("user"),
  banned: integer("banned", { mode: "boolean" }).default(false),
  banReason: text("ban_reason"),
  banExpires: integer("ban_expires", { mode: "timestamp_ms" }),
  // Approval field (via additionalFields)
  approved: integer("approved", { mode: "boolean" }).default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});
```

### 3. Update Auth State and Provider

```typescript
// src/lib/auth.tsx
export type AuthState = {
  userId: string | null
  orgId: string | null
  isAuthenticated: boolean
  role: string | null
  approved: boolean
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
        const isApproved = session.user.approved ?? false

        setAuth({
          userId: session.user.id,
          orgId: isApproved ? (session.session.activeOrganizationId ?? null) : null,
          isAuthenticated: isApproved && !!session.session.activeOrganizationId,
          role: session.user.role ?? 'user',
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
    <AuthContext.Provider value={{ ...auth, isLoading, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
```

### 4. Update InnerApp for Pending Users

```tsx
// src/main.tsx
import { PendingApproval } from "./components/pending-approval";

function InnerApp() {
  const auth = useAuth();

  if (auth.isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  // Show pending approval screen for unapproved users
  if (auth.userId && !auth.approved) {
    return <PendingApproval />;
  }

  return <RouterProvider router={router} context={{ auth }} />;
}
```

### 5. Simplified Pending Approval Component

```tsx
// src/components/pending-approval.tsx
import { ClockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";

export function PendingApproval() {
  const { logout } = useAuth();

  const handleSignOut = async () => {
    await logout();
    window.location.reload();
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-muted/30">
      <Card className="max-w-md">
        <CardContent className="pt-6 text-center">
          <ClockIcon className="mx-auto h-12 w-12 text-yellow-500 mb-4" />
          <h1 className="text-xl font-semibold mb-2">
            Account Pending Approval
          </h1>
          <p className="text-muted-foreground mb-6">
            Your account is waiting for admin approval. You'll be able to access
            the app once approved.
          </p>
          <Button variant="outline" onClick={handleSignOut}>
            Sign Out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

### 6. Admin Modal Component

```tsx
// src/components/admin-modal.tsx
import { useState, useEffect } from "react";
import {
  CheckIcon,
  XIcon,
  BanIcon,
  ShieldIcon,
  UsersIcon,
  ClockIcon,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { authClient } from "@/lib/auth";

interface User {
  id: string;
  name: string;
  email: string;
  role: string | null;
  approved: boolean;
  banned: boolean;
  createdAt: Date;
}

interface AdminModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminModal({ open, onOpenChange }: AdminModalProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await authClient.admin.listUsers({
        query: {
          sortBy: "createdAt",
          sortDirection: "desc",
        },
      });
      if (error) {
        setError(error.message || "Failed to fetch users");
        return;
      }
      setUsers((data?.users as User[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch users");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchUsers();
    }
  }, [open]);

  const handleApprove = async (userId: string) => {
    setActionLoading(userId);
    try {
      // Use updateUser to set approved: true
      const { error } = await authClient.admin.updateUser({
        userId,
        data: { approved: true },
      });
      if (error) throw new Error(error.message);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId: string) => {
    setActionLoading(userId);
    try {
      const { error } = await authClient.admin.removeUser({ userId });
      if (error) throw new Error(error.message);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleBan = async (userId: string) => {
    setActionLoading(userId);
    try {
      const { error } = await authClient.admin.banUser({
        userId,
        banReason: "Banned by admin",
      });
      if (error) throw new Error(error.message);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ban user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnban = async (userId: string) => {
    setActionLoading(userId);
    try {
      const { error } = await authClient.admin.unbanUser({ userId });
      if (error) throw new Error(error.message);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unban user");
    } finally {
      setActionLoading(null);
    }
  };

  const handleMakeAdmin = async (userId: string) => {
    setActionLoading(userId);
    try {
      const { error } = await authClient.admin.setRole({
        userId,
        role: "admin",
      });
      if (error) throw new Error(error.message);
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to set admin role");
    } finally {
      setActionLoading(null);
    }
  };

  const getUserStatus = (user: User): "pending" | "active" | "banned" => {
    if (user.banned) return "banned";
    if (!user.approved) return "pending";
    return "active";
  };

  // Stats
  const pendingCount = users.filter((u) => !u.approved && !u.banned).length;
  const activeCount = users.filter((u) => u.approved && !u.banned).length;
  const bannedCount = users.filter((u) => u.banned).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Admin</DialogTitle>
          <DialogDescription>Manage users and approvals</DialogDescription>
        </DialogHeader>

        {/* Stats */}
        <div className="flex gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <UsersIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{users.length}</span>
            <span className="text-muted-foreground">total</span>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-1.5">
              <ClockIcon className="h-4 w-4 text-yellow-500" />
              <span className="font-medium">{pendingCount}</span>
              <span className="text-muted-foreground">pending</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <CheckIcon className="h-4 w-4 text-green-500" />
            <span className="font-medium">{activeCount}</span>
            <span className="text-muted-foreground">active</span>
          </div>
          {bannedCount > 0 && (
            <div className="flex items-center gap-1.5">
              <BanIcon className="h-4 w-4 text-red-500" />
              <span className="font-medium">{bannedCount}</span>
              <span className="text-muted-foreground">banned</span>
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* User list */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
          {isLoading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <UsersIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No users yet</p>
            </div>
          ) : (
            users.map((user) => {
              const status = getUserStatus(user);
              const isActionLoading = actionLoading === user.id;
              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-3 bg-muted/50 gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-xs truncate">
                        {user.name}
                      </span>
                      {user.role === "admin" && (
                        <Badge variant="secondary">Admin</Badge>
                      )}
                      {status === "pending" && (
                        <Badge
                          variant="outline"
                          className="bg-yellow-50 text-yellow-700 border-yellow-200"
                        >
                          Pending
                        </Badge>
                      )}
                      {status === "banned" && (
                        <Badge
                          variant="outline"
                          className="bg-red-50 text-red-700 border-red-200"
                        >
                          Banned
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {user.email}
                    </p>
                  </div>

                  <div className="flex gap-1 shrink-0">
                    {status === "pending" && (
                      <>
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() => handleApprove(user.id)}
                          disabled={isActionLoading}
                          title="Approve"
                        >
                          <CheckIcon className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() => handleReject(user.id)}
                          disabled={isActionLoading}
                          title="Reject"
                        >
                          <XIcon className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </>
                    )}
                    {status === "active" && user.role !== "admin" && (
                      <>
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() => handleMakeAdmin(user.id)}
                          disabled={isActionLoading}
                          title="Make Admin"
                        >
                          <ShieldIcon className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="outline"
                          onClick={() => handleBan(user.id)}
                          disabled={isActionLoading}
                          title="Ban"
                        >
                          <BanIcon className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </>
                    )}
                    {status === "banned" && (
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => handleUnban(user.id)}
                        disabled={isActionLoading}
                        title="Unban"
                      >
                        <CheckIcon className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

## Bootstrap First Admin

All new users start with `approved: false`. Set the first admin manually after migration.

### Manual Bootstrap via Wrangler

```bash
# Set specific user as admin and approved (local)
wrangler d1 execute cloudstash-local --local --command \
  "UPDATE user SET role = 'admin', approved = 1 WHERE email = 'your@email.com'"

# Set specific user as admin and approved (production)
wrangler d1 execute cloudstash --env production --remote --command \
  "UPDATE user SET role = 'admin', approved = 1 WHERE email = 'your@email.com'"
```

After that, admins can approve other users via the Admin modal.

## User Flows

### Flow 1: New User (Pending Approval)

```
1. User visits app → redirected to /login
2. User clicks "Continue with Google"
3. Google OAuth completes → user created in DB with approved=false
4. databaseHooks.user.create.after runs:
   - Creates personal workspace
5. Session created
6. AuthProvider reads session → auth.approved=false
7. InnerApp in main.tsx renders <PendingApproval /> instead of router
8. User sees "Account Pending Approval" screen with Sign Out button
```

### Flow 2: Admin Approves User

```
1. Admin clicks Admin button in sidebar → AdminModal opens
2. Admin sees user with "Pending" badge
3. Admin clicks checkmark (approve) button
4. authClient.admin.updateUser({ userId, data: { approved: true } }) called
5. User's approved field set to true in DB
6. Next time user refreshes:
   - AuthProvider reads session → auth.approved=true
   - User sees main app
```

### Flow 3: Admin Rejects User

```
1. Admin clicks X (reject) button in AdminModal
2. authClient.admin.removeUser({ userId }) called
3. User deleted from database
4. If user tries to access app → redirected to login
5. User would need to sign up again
```

### Flow 4: Admin Bans User

```
1. Admin clicks ban button on an active user in AdminModal
2. authClient.admin.banUser({ userId, banReason }) called
3. User's banned field set to true in DB
4. Next time user tries to access app:
   - Better Auth blocks login → redirects to /api/auth/error
   - User sees Better Auth's default error page
```

## Implementation Order

Execute these steps in order.

### Step 1: Schema Migration

1. Edit `src/cf-worker/db/schema.ts`:
   - Add `approved` field to user table

2. Generate migration:

   ```bash
   bun drizzle-kit generate
   ```

3. **ASK USER** to run migrations:
   ```bash
   bun run db:migrate:local
   bun run db:migrate:remote  # when ready
   ```

### Step 2: Backend Auth Config

1. Edit `src/cf-worker/auth/index.ts`:
   - Add `user.additionalFields.approved` configuration
   - Remove the `banned: true` logic from user create hook

### Step 3: Frontend Auth

1. Edit `src/lib/auth.tsx`:
   - Remove `banned`, `banReason` from `AuthState`
   - Add `approved: boolean` to `AuthState`
   - Update `AuthProvider` to read `approved` from session

### Step 4: Update Pending Approval Flow

1. Edit `src/main.tsx`:
   - Change check from `auth.banned` to `auth.userId && !auth.approved`

2. Edit `src/components/pending-approval.tsx`:
   - Remove banned-related logic (simplify to pending-only)

### Step 5: Update Admin Modal

1. Edit `src/components/admin-modal.tsx`:
   - Update `User` interface to use `approved` instead of `banReason`
   - Change `handleApprove` to use `authClient.admin.updateUser`
   - Update `getUserStatus` to check `approved` field
   - Add `handleUnban` for actual bans

### Step 6: Bootstrap Admin

1. Run wrangler command to set first admin:
   ```bash
   wrangler d1 execute cloudstash-local --local --command \
     "UPDATE user SET role = 'admin', approved = 1 WHERE email = 'your@email.com'"
   ```

## Implementation Checklist

### Backend

- [x] Add `approved` field to user schema
- [x] Generate Drizzle migration (0005_foamy_blindfold.sql)
- [x] Apply Drizzle migration (`bun run db:migrate:local`)
- [x] Add `user.additionalFields.approved` to auth config
- [x] Remove `banned: true` logic from user create hook
- [ ] Bootstrap first admin manually via wrangler

### Frontend

- [x] Update `AuthState` type: remove `banned`/`banReason`, add `approved`
- [x] Update `AuthProvider` to read `approved` from session
- [x] Update `main.tsx` to check `!approved` instead of `banned`
- [x] Simplify `PendingApproval` component (pending-only)
- [x] Update `AdminModal` to use `updateUser` for approval
- [x] Update `AdminModal` to show status based on `approved` field

### Testing

- [ ] New users see pending approval screen
- [ ] Manual admin bootstrap works via wrangler
- [ ] Admin can see Admin button, non-admin cannot
- [ ] Admin can approve user → user gains access
- [ ] Admin can reject user → user deleted
- [ ] Admin can ban active user → user sees Better Auth error page
- [ ] Admin can unban user → user regains access

## Quick Reference: Files to Modify

| File                                  | Changes                                                                |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `src/cf-worker/db/schema.ts`          | Add `approved` field to user table                                     |
| `src/cf-worker/auth/index.ts`         | Add `user.additionalFields.approved`, remove banned logic from hook    |
| `src/lib/auth.tsx`                    | Update `AuthState` (approved instead of banned), update `AuthProvider` |
| `src/main.tsx`                        | Check `!auth.approved` instead of `auth.banned`                        |
| `src/components/pending-approval.tsx` | Simplify to pending-only message                                       |
| `src/components/admin-modal.tsx`      | Use `updateUser` for approval, check `approved` for status             |
