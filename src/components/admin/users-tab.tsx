import {
  UsersIcon,
  ClockIcon,
  CheckIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { AdminUser } from "@/components/admin/use-users-admin";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { bestFuzzyScore } from "@/lib/fuzzy";

import { SignupGateToggle } from "./signup-gate-toggle";
import { UserRow } from "./user-row";

interface UsersTabProps {
  users: AdminUser[];
  isLoading: boolean;
  error: string | null;
  pendingCount: number;
  activeCount: number;
  adminCount: number;
  currentUserId: string;
}

export function UsersTab({
  users,
  isLoading,
  error,
  pendingCount,
  activeCount,
  adminCount,
  currentUserId,
}: UsersTabProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const self = users.filter((u) => u.id === currentUserId);
      const rest = users.filter((u) => u.id !== currentUserId);
      return [...self, ...rest];
    }
    return users
      .map((user) => ({
        user,
        score: bestFuzzyScore(q, [user.name, user.email]),
      }))
      .filter((r): r is { user: AdminUser; score: number } => r.score !== null)
      .toSorted((a, b) => b.score - a.score)
      .map((r) => r.user);
  }, [users, query, currentUserId]);

  return (
    <TabsContent value="users" className="flex-1 flex flex-col min-h-0">
      <div className="mb-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs">
          <div className="flex gap-4">
            <div className="flex items-center gap-1.5">
              <UsersIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium tabular-nums">{users.length}</span>
              <span className="text-muted-foreground">total</span>
            </div>
            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5">
                <ClockIcon className="h-4 w-4 text-yellow-500" />
                <span className="font-medium tabular-nums">{pendingCount}</span>
                <span className="text-muted-foreground">pending</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <CheckIcon className="h-4 w-4 text-green-500" />
              <span className="font-medium tabular-nums">{activeCount}</span>
              <span className="text-muted-foreground">active</span>
            </div>
          </div>

          <SignupGateToggle />
        </div>

        {!isLoading && users.length > 0 && (
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <InputGroupText>
                <SearchIcon className="size-3.5" />
              </InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search by name or email"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search users by name or email"
            />
            {query && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

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
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <SearchIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No users match “{query.trim()}”</p>
          </div>
        ) : (
          filtered.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              adminCount={adminCount}
              isSelf={user.id === currentUserId}
            />
          ))
        )}
      </div>
    </TabsContent>
  );
}
