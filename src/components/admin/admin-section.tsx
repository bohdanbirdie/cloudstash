import {
  UsersIcon,
  TicketIcon,
  BuildingIcon,
  BarChart3Icon,
} from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";

import { InvitesTab } from "./invites-tab";
import { UsageTab } from "./usage-tab";
import { useInvitesAdmin } from "./use-invites-admin";
import { useUsageAdmin } from "./use-usage-admin";
import type { UsagePeriod } from "./use-usage-admin";
import { useUsersAdmin } from "./use-users-admin";
import { useWorkspacesAdmin } from "./use-workspaces-admin";
import { UsersTab } from "./users-tab";
import { WorkspacesTab } from "./workspaces-tab";

export function AdminSection() {
  const [activeTab, setActiveTab] = useState<string | null>("users");
  const [usagePeriod, setUsagePeriod] = useState<UsagePeriod>("24h");
  const { orgId } = useAuth();

  const users = useUsersAdmin(true);
  const invites = useInvitesAdmin(true);
  const workspaces = useWorkspacesAdmin(true);
  const usage = useUsageAdmin(usagePeriod, users.users, true);

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="flex flex-1 flex-col min-h-0"
    >
      <TabsList variant="line">
        <TabsTrigger value="users">
          <UsersIcon className="h-3.5 w-3.5" />
          Users
          {users.pendingCount > 0 && (
            <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
              {users.pendingCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="invites">
          <TicketIcon className="h-3.5 w-3.5" />
          Invites
          {invites.availableCount > 0 && (
            <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">
              {invites.availableCount}
            </Badge>
          )}
        </TabsTrigger>
        <TabsTrigger value="workspaces">
          <BuildingIcon className="h-3.5 w-3.5" />
          Workspaces
        </TabsTrigger>
        <TabsTrigger value="usage">
          <BarChart3Icon className="h-3.5 w-3.5" />
          Usage
        </TabsTrigger>
      </TabsList>

      <UsersTab
        users={users.users}
        isLoading={users.isLoading}
        error={users.error}
        pendingCount={users.pendingCount}
        activeCount={users.activeCount}
        adminCount={users.adminCount}
      />

      <InvitesTab
        invites={invites.invites}
        isLoading={invites.isLoading}
        error={invites.error}
        isCreating={invites.isCreating}
        actionLoading={invites.actionLoading}
        newInviteCode={invites.newInviteCode}
        copiedCode={invites.copiedCode}
        onCreate={invites.handleCreate}
        onDelete={invites.handleDelete}
        onCopyCode={invites.handleCopyCode}
      />

      <WorkspacesTab
        workspaces={workspaces.workspaces}
        isLoading={workspaces.isLoading}
        error={workspaces.error}
        isMutating={workspaces.isMutating}
        aiEnabledCount={workspaces.aiEnabledCount}
        chatEnabledCount={workspaces.chatEnabledCount}
        currentOrgId={orgId}
        onToggleAiSummary={workspaces.toggleAiSummary}
        onToggleChatAgent={workspaces.toggleChatAgent}
        onUpdateTokenBudget={workspaces.updateTokenBudget}
      />

      <UsageTab
        summaries={usage.summaries}
        isLoading={usage.isLoading}
        error={usage.error}
        totals={usage.totals}
        period={usagePeriod}
        onPeriodChange={setUsagePeriod}
      />
    </Tabs>
  );
}
