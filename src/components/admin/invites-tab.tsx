import {
  CheckIcon,
  CopyIcon,
  TicketIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { type InviteWithRelations } from "@/types/api";

import { getInviteStatus } from "./use-invites-admin";

interface InvitesTabProps {
  invites: InviteWithRelations[];
  isLoading: boolean;
  error: string | null;
  isCreating: boolean;
  actionLoading: string | null;
  newInviteCode: string | null;
  copiedCode: boolean;
  onCreate: () => void;
  onDelete: (inviteId: string) => void;
  onCopyCode: (code: string) => void;
}

export function InvitesTab({
  invites,
  isLoading,
  error,
  isCreating,
  actionLoading,
  newInviteCode,
  copiedCode,
  onCreate,
  onDelete,
  onCopyCode,
}: InvitesTabProps) {
  return (
    <TabsContent value="invites" className="flex-1 flex flex-col min-h-0">
      {newInviteCode && (
        <div className="mb-3 p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800">
          <p className="text-xs text-green-700 dark:text-green-300 mb-2">
            Invite code created! Share this with the user:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-sm bg-white dark:bg-black px-2 py-1 rounded">
              {newInviteCode}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCopyCode(newInviteCode)}
            >
              {copiedCode ? (
                <CheckIcon className="h-3.5 w-3.5 text-green-600" />
              ) : (
                <CopyIcon className="h-3.5 w-3.5" />
              )}
              {copiedCode ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      )}

      <div className="mb-3">
        <Button size="sm" onClick={onCreate} disabled={isCreating}>
          {isCreating ? (
            <Spinner className="h-3.5 w-3.5" />
          ) : (
            <PlusIcon className="h-3.5 w-3.5" />
          )}
          Create Invite
        </Button>
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
          </>
        ) : invites.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <TicketIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No invite codes yet</p>
          </div>
        ) : (
          invites.map((invite) => {
            const status = getInviteStatus(invite);
            const isActionLoading = actionLoading === invite.id;
            return (
              <div
                key={invite.id}
                className="flex items-center justify-between p-3 bg-muted/50 gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs font-medium">
                      {invite.code}
                    </code>
                    {status === "available" && (
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200"
                      >
                        Available
                      </Badge>
                    )}
                    {status === "used" && (
                      <Badge
                        variant="outline"
                        className="bg-gray-50 text-gray-600 border-gray-200"
                      >
                        Used
                      </Badge>
                    )}
                    {status === "expired" && (
                      <Badge
                        variant="outline"
                        className="bg-red-50 text-red-700 border-red-200"
                      >
                        Expired
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {status === "used" && invite.usedBy
                      ? `Used by ${invite.usedBy.name}`
                      : `Created by ${invite.createdBy?.name ?? "Unknown"}`}
                  </p>
                </div>

                <div className="flex gap-1 shrink-0">
                  {status === "available" && (
                    <>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="outline"
                              onClick={() => onCopyCode(invite.code)}
                            >
                              <CopyIcon className="h-3.5 w-3.5" />
                            </Button>
                          }
                        />
                        <TooltipContent>Copy code</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              size="icon-sm"
                              variant="outline"
                              onClick={() => onDelete(invite.id)}
                              disabled={isActionLoading}
                            >
                              <TrashIcon className="h-3.5 w-3.5 text-red-600" />
                            </Button>
                          }
                        />
                        <TooltipContent>Delete invite</TooltipContent>
                      </Tooltip>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </TabsContent>
  );
}
