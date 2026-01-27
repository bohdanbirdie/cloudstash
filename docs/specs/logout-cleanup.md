# Logout Cleanup Spec

## Overview

Clear OPFS and IndexedDB data after logout to prevent stale data on shared devices and ensure clean state on next login.

## Problem

When a user logs out:

1. LiveStore data persists in OPFS/IndexedDB
2. Next user logging in may see stale data briefly
3. Shared device users could potentially access cached data
4. Storage accumulates across sessions

## Solution Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Logout Flow                             │
│                                                              │
│  1. User clicks logout                                       │
│           │                                                  │
│           ▼                                                  │
│  2. Shutdown LiveStore gracefully                           │
│     - Stop sync                                              │
│     - Close connections                                      │
│           │                                                  │
│           ▼                                                  │
│  3. Clear browser storage                                   │
│     - OPFS (Origin Private File System)                     │
│     - IndexedDB databases                                   │
│           │                                                  │
│           ▼                                                  │
│  4. Call Better Auth signOut()                              │
│           │                                                  │
│           ▼                                                  │
│  5. Redirect to login                                       │
└─────────────────────────────────────────────────────────────┘
```

## Implementation

### Logout Service

```typescript
// src/web/services/logout.ts
import { authClient } from "@/lib/auth-client";

export async function performLogout(): Promise<void> {
  // 1. Shutdown LiveStore
  await shutdownLiveStore();

  // 2. Clear OPFS
  await clearOPFS();

  // 3. Clear IndexedDB
  await clearIndexedDB();

  // 4. Sign out via Better Auth
  await authClient.signOut();

  // 5. Redirect handled by auth client or router
}
```

### LiveStore Shutdown

```typescript
// src/web/services/livestore.ts
let storeInstance: LiveStoreInstance | null = null;

export function setStoreInstance(store: LiveStoreInstance) {
  storeInstance = store;
}

export async function shutdownLiveStore(): Promise<void> {
  if (!storeInstance) return;

  try {
    // Stop sync subscription if active
    if (storeInstance.syncSubscription) {
      storeInstance.syncSubscription.unsubscribe();
    }

    // Close the store
    await storeInstance.close();

    storeInstance = null;
  } catch (error) {
    console.error("Error shutting down LiveStore:", error);
    // Continue with cleanup even if shutdown fails
  }
}
```

### Clear OPFS

```typescript
// src/web/services/storage.ts
export async function clearOPFS(): Promise<void> {
  try {
    // Get OPFS root
    const root = await navigator.storage.getDirectory();

    // Delete all files and directories
    for await (const [name] of root.entries()) {
      await root.removeEntry(name, { recursive: true });
    }

    console.log("OPFS cleared successfully");
  } catch (error) {
    // OPFS might not be available in all browsers
    if (error instanceof Error && error.name !== "NotFoundError") {
      console.error("Error clearing OPFS:", error);
    }
  }
}
```

### Clear IndexedDB

```typescript
// src/web/services/storage.ts
export async function clearIndexedDB(): Promise<void> {
  try {
    // Get all database names
    const databases = await indexedDB.databases();

    // Delete each database
    await Promise.all(
      databases
        .filter((db) => db.name) // Filter out undefined names
        .map(
          (db) =>
            new Promise<void>((resolve, reject) => {
              const request = indexedDB.deleteDatabase(db.name!);
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
              request.onblocked = () => {
                console.warn(`Database ${db.name} deletion blocked`);
                resolve(); // Continue anyway
              };
            })
        )
    );

    console.log("IndexedDB cleared successfully");
  } catch (error) {
    console.error("Error clearing IndexedDB:", error);
  }
}
```

### Clear All Storage (Combined)

```typescript
// src/web/services/storage.ts
export async function clearAllStorage(): Promise<void> {
  await Promise.all([
    clearOPFS(),
    clearIndexedDB(),
    // Also clear localStorage/sessionStorage if used
    clearLocalStorage(),
  ]);
}

function clearLocalStorage(): void {
  try {
    // Only clear app-specific keys, not all localStorage
    const appKeys = Object.keys(localStorage).filter(
      (key) => key.startsWith("linkbucket_") || key.startsWith("livestore_")
    );
    appKeys.forEach((key) => localStorage.removeItem(key));
  } catch (error) {
    console.error("Error clearing localStorage:", error);
  }
}
```

## UI Integration

### Logout Button Component

```tsx
// src/web/components/LogoutButton.tsx
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { performLogout } from "@/services/logout";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut } from "lucide-react";

export function LogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await performLogout();
      navigate({ to: "/login" });
    } catch (error) {
      console.error("Logout failed:", error);
      // Still navigate to login even if cleanup fails
      navigate({ to: "/login" });
    }
  };

  return (
    <Button variant="ghost" onClick={handleLogout} disabled={isLoggingOut}>
      {isLoggingOut ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : (
        <LogOut className="w-4 h-4 mr-2" />
      )}
      {isLoggingOut ? "Logging out..." : "Logout"}
    </Button>
  );
}
```

### User Menu with Logout

```tsx
// src/web/components/UserMenu.tsx
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const { data: session } = useSession();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await performLogout();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar>
            <AvatarImage src={session?.user?.image} />
            <AvatarFallback>{session?.user?.name?.[0]}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}>
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="text-red-600"
        >
          {isLoggingOut ? "Logging out..." : "Logout"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

## Error Handling

```typescript
// src/web/services/logout.ts
export async function performLogout(): Promise<void> {
  const errors: Error[] = [];

  // Try each step, collecting errors
  try {
    await shutdownLiveStore();
  } catch (e) {
    errors.push(e as Error);
  }

  try {
    await clearAllStorage();
  } catch (e) {
    errors.push(e as Error);
  }

  // Always sign out, even if cleanup failed
  try {
    await authClient.signOut();
  } catch (e) {
    errors.push(e as Error);
  }

  // Log errors but don't throw - user should still be logged out
  if (errors.length > 0) {
    console.error("Logout completed with errors:", errors);
  }
}
```

## Browser Compatibility

| Feature               | Chrome | Firefox       | Safari        | Edge |
| --------------------- | ------ | ------------- | ------------- | ---- |
| OPFS                  | 86+    | 111+          | 15.2+         | 86+  |
| IndexedDB.databases() | 71+    | Not supported | Not supported | 79+  |

### Fallback for Firefox/Safari

```typescript
// src/web/services/storage.ts
async function listIndexedDBDatabases(): Promise<{ name: string }[]> {
  // Modern browsers
  if ("databases" in indexedDB) {
    return await indexedDB.databases();
  }

  // Fallback: use known database names
  return [
    { name: "livestore" },
    { name: "livestore-sync" },
    // Add other known DB names
  ];
}
```

## Testing

```typescript
// src/web/services/__tests__/logout.test.ts
describe("logout", () => {
  it("should shutdown livestore before clearing storage", async () => {
    const shutdownSpy = vi.spyOn(livestore, "shutdownLiveStore");
    const clearSpy = vi.spyOn(storage, "clearAllStorage");

    await performLogout();

    expect(shutdownSpy).toHaveBeenCalled();
    expect(clearSpy).toHaveBeenCalled();
    // Shutdown should complete before clear
    expect(shutdownSpy.mock.invocationCallOrder[0]).toBeLessThan(
      clearSpy.mock.invocationCallOrder[0]
    );
  });

  it("should complete logout even if storage clear fails", async () => {
    vi.spyOn(storage, "clearOPFS").mockRejectedValue(new Error("OPFS failed"));
    const signOutSpy = vi.spyOn(authClient, "signOut");

    await performLogout();

    expect(signOutSpy).toHaveBeenCalled();
  });
});
```

## Implementation Checklist

- [ ] Create shutdownLiveStore function
- [ ] Create clearOPFS function
- [ ] Create clearIndexedDB function with fallback
- [ ] Create clearLocalStorage function
- [ ] Create performLogout orchestration function
- [ ] Update LogoutButton component
- [ ] Update UserMenu component
- [ ] Add browser compatibility fallbacks
- [ ] Add error handling and logging
- [ ] Write tests for logout flow
- [ ] Test on Chrome, Firefox, Safari
