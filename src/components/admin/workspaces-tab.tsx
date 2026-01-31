import { BuildingIcon, MessageSquareIcon, SparklesIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { type Workspace } from "./use-workspaces-admin";

interface WorkspacesTabProps {
  workspaces: Workspace[];
  isLoading: boolean;
  error: string | null;
  isMutating: boolean;
  aiEnabledCount: number;
  chatEnabledCount: number;
  currentOrgId: string | null;
  onToggleAiSummary: (orgId: string, currentValue: boolean) => void;
  onToggleChatAgent: (orgId: string, currentValue: boolean) => void;
}

export function WorkspacesTab({
  workspaces,
  isLoading,
  error,
  isMutating,
  aiEnabledCount,
  chatEnabledCount,
  currentOrgId,
  onToggleAiSummary,
  onToggleChatAgent,
}: WorkspacesTabProps) {
  return (
    <TabsContent value="workspaces" className="flex-1 flex flex-col min-h-0">
      <div className="flex gap-4 text-xs mb-3">
        <div className="flex items-center gap-1.5">
          <BuildingIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{workspaces.length}</span>
          <span className="text-muted-foreground">total</span>
        </div>
        <div className="flex items-center gap-1.5">
          <SparklesIcon className="h-4 w-4 text-blue-500" />
          <span className="font-medium">{aiEnabledCount}</span>
          <span className="text-muted-foreground">AI enabled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MessageSquareIcon className="h-4 w-4 text-green-500" />
          <span className="font-medium">{chatEnabledCount}</span>
          <span className="text-muted-foreground">Chat enabled</span>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : workspaces.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <BuildingIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-xs">No workspaces yet</p>
          </div>
        ) : (
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left py-2 font-medium w-[30%]">
                  Workspace
                </th>
                <th className="text-left py-2 font-medium w-[30%]">Creator</th>
                <th className="text-right py-2 font-medium w-[20%]">
                  AI Summaries
                </th>
                <th className="text-right py-2 font-medium w-[20%]">
                  Chat Agent
                </th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((workspace) => {
                const isCurrent = workspace.id === currentOrgId;
                const workspaceId = (
                  <div className="font-mono text-xs truncate">
                    {workspace.id}
                  </div>
                );
                return (
                  <tr key={workspace.id} className="border-b last:border-0">
                    <td
                      className={
                        isCurrent
                          ? "py-2 pl-2 border-l-2 border-l-primary"
                          : "py-2 pl-2"
                      }
                    >
                      {isCurrent ? (
                        <Tooltip>
                          <TooltipTrigger render={workspaceId} />
                          <TooltipContent>Current workspace</TooltipContent>
                        </Tooltip>
                      ) : (
                        workspaceId
                      )}
                      {workspace.name && (
                        <div className="text-xs text-muted-foreground truncate">
                          {workspace.name}
                        </div>
                      )}
                    </td>
                    <td className="py-2">
                      <span className="text-xs text-muted-foreground block truncate">
                        {workspace.creatorEmail ?? "—"}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <Switch
                        checked={workspace.features.aiSummary ?? false}
                        onCheckedChange={() =>
                          onToggleAiSummary(
                            workspace.id,
                            workspace.features.aiSummary ?? false
                          )
                        }
                        disabled={isMutating}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Switch
                        checked={workspace.features.chatAgentEnabled ?? false}
                        onCheckedChange={() =>
                          onToggleChatAgent(
                            workspace.id,
                            workspace.features.chatAgentEnabled ?? false
                          )
                        }
                        disabled={isMutating}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </TabsContent>
  );
}
