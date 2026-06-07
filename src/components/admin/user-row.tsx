import { CheckIcon, XIcon, BanIcon, ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { mutate } from "swr";
import useSWRMutation from "swr/mutation";

import type { AdminUser } from "@/components/admin/use-users-admin";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { authClient } from "@/lib/auth";
import { MICRO_LABEL } from "@/lib/typography";
import { cn } from "@/lib/utils";

import { getUserStatus } from "./use-users-admin";
import { IS_DEV, redactEmail } from "./workspaces-tab/redact";

const ASSIGNABLE_ROLES = ["user", "viewer", "admin"] as const;
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

const ROLE_LABEL: Record<AssignableRole, string> = {
  user: "User",
  viewer: "Viewer",
  admin: "Admin",
};

const ROLE_DOT: Record<AssignableRole, string> = {
  user: "bg-muted-foreground/40",
  viewer: "bg-primary/50",
  admin: "bg-primary",
};

const ROLE_RANK: Record<AssignableRole, number> = {
  user: 0,
  viewer: 1,
  admin: 2,
};

function isDemotion(from: AssignableRole, to: AssignableRole): boolean {
  return ROLE_RANK[to] < ROLE_RANK[from];
}

const ROLE_DESCRIPTION: Record<AssignableRole, string> = {
  user: "a standard account with no admin access",
  viewer: "read-only access to the admin dashboard",
  admin: "full admin access, including managing roles",
};

interface UserRowProps {
  user: AdminUser;
  adminCount: number;
  isSelf: boolean;
}

async function approveUser(_: string, { arg }: { arg: { userId: string } }) {
  const res = await fetch(`/api/admin/users/${arg.userId}/approve`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const data: { error?: string } = await res.json();
    throw new Error(data.error || "Failed to approve user");
  }
  void mutate("admin-users");
}

async function rejectUser(_: string, { arg }: { arg: { userId: string } }) {
  const { error } = await authClient.admin.removeUser({ userId: arg.userId });
  if (error) {
    throw new Error(error.message);
  }
  void mutate("admin-users");
}

async function banUser(_: string, { arg }: { arg: { userId: string } }) {
  const { error } = await authClient.admin.banUser({
    banReason: "Banned by admin",
    userId: arg.userId,
  });
  if (error) {
    throw new Error(error.message);
  }
  void mutate("admin-users");
}

async function unbanUser(_: string, { arg }: { arg: { userId: string } }) {
  const { error } = await authClient.admin.unbanUser({ userId: arg.userId });
  if (error) {
    throw new Error(error.message);
  }
  void mutate("admin-users");
}

async function setUserRole(
  _: string,
  { arg }: { arg: { userId: string; role: AssignableRole } }
) {
  const { error } = await authClient.admin.setRole({
    role: arg.role,
    userId: arg.userId,
  });
  if (error) {
    throw new Error(error.message);
  }
  void mutate("admin-users");
}

function toAssignableRole(role: string | null | undefined): AssignableRole {
  return ASSIGNABLE_ROLES.includes(role as AssignableRole)
    ? (role as AssignableRole)
    : "user";
}

export function UserRow({ user, adminCount, isSelf }: UserRowProps) {
  const [pendingRole, setPendingRole] = useState<AssignableRole | null>(null);

  const approve = useSWRMutation("approve-user", approveUser);
  const reject = useSWRMutation("reject-user", rejectUser);
  const ban = useSWRMutation("ban-user", banUser);
  const unban = useSWRMutation("unban-user", unbanUser);
  const setRole = useSWRMutation("set-user-role", setUserRole);

  const status = getUserStatus(user);
  const currentRole = toAssignableRole(user.role);
  // Block demoting the last admin so the workspace can't get locked out.
  const isSoleAdmin = currentRole === "admin" && adminCount <= 1;
  const isSelfAdmin = isSelf && currentRole === "admin";
  const lockAdmin = isSoleAdmin || isSelfAdmin;
  const lockReason = isSelfAdmin
    ? "You can't change your own role."
    : isSoleAdmin
      ? "Keep at least one admin."
      : null;
  const isLoading =
    approve.isMutating ||
    reject.isMutating ||
    ban.isMutating ||
    unban.isMutating ||
    setRole.isMutating;

  const handleSelectRole = (next: AssignableRole) => {
    if (next !== currentRole) setPendingRole(next);
  };

  const handleConfirmRole = () => {
    if (pendingRole) {
      void setRole.trigger({ role: pendingRole, userId: user.id });
    }
    setPendingRole(null);
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-md border p-3",
          isSelf
            ? "border-primary/30 bg-primary/[0.03]"
            : "border-border/60 bg-background"
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate font-medium text-xs">
              {user.name}
            </span>
            {isSelf && (
              <span className={cn(MICRO_LABEL, "shrink-0 text-primary/80")}>
                you
              </span>
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
          <div className="text-xs text-muted-foreground truncate">
            {IS_DEV ? (
              user.email
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label="Reveal email"
                      className="font-mono text-xs text-muted-foreground hover:text-foreground rounded-sm cursor-help focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                    >
                      {redactEmail(user.email)}
                    </button>
                  }
                />
                <TooltipContent>{user.email}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        <div className="flex gap-1 shrink-0">
          {status === "pending" && (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={() => approve.trigger({ userId: user.id })}
                      disabled={isLoading}
                    >
                      <CheckIcon className="h-3.5 w-3.5 text-green-600" />
                    </Button>
                  }
                />
                <TooltipContent>Approve user</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="outline"
                      onClick={() => reject.trigger({ userId: user.id })}
                      disabled={isLoading}
                    >
                      <XIcon className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  }
                />
                <TooltipContent>Reject and delete user</TooltipContent>
              </Tooltip>
            </>
          )}
          {status === "active" && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-background"
                      disabled={isLoading}
                    >
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          ROLE_DOT[currentRole]
                        )}
                      />
                      {ROLE_LABEL[currentRole]}
                      <ChevronDownIcon className="opacity-60" />
                    </Button>
                  }
                />
                <DropdownMenuContent
                  align="end"
                  className={lockReason ? "min-w-52" : undefined}
                >
                  <DropdownMenuRadioGroup
                    value={currentRole}
                    onValueChange={(value) =>
                      handleSelectRole(value as AssignableRole)
                    }
                  >
                    {ASSIGNABLE_ROLES.map((role) => (
                      <DropdownMenuRadioItem
                        key={role}
                        value={role}
                        disabled={lockAdmin && role !== "admin"}
                      >
                        <span
                          className={cn(
                            "size-1.5 rounded-full",
                            ROLE_DOT[role]
                          )}
                        />
                        {ROLE_LABEL[role]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                  {lockReason && (
                    <>
                      <DropdownMenuSeparator />
                      <p className="px-2 py-1.5 text-xs text-muted-foreground/70">
                        {lockReason}
                      </p>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              {currentRole !== "admin" && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => ban.trigger({ userId: user.id })}
                        disabled={isLoading}
                      >
                        <BanIcon className="h-3.5 w-3.5 text-red-600" />
                      </Button>
                    }
                  />
                  <TooltipContent>Ban user</TooltipContent>
                </Tooltip>
              )}
            </>
          )}
          {status === "banned" && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="outline"
                    onClick={() => unban.trigger({ userId: user.id })}
                    disabled={isLoading}
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                  </Button>
                }
              />
              <TooltipContent>Unban user</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <AlertDialog
        open={!!pendingRole}
        onOpenChange={(open) => !open && setPendingRole(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Change role to {pendingRole ? ROLE_LABEL[pendingRole] : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingRole
                ? `${user.name} will have ${ROLE_DESCRIPTION[pendingRole]}.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={
                pendingRole && isDemotion(currentRole, pendingRole)
                  ? "destructive"
                  : "default"
              }
              onClick={handleConfirmRole}
            >
              Change role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
