import { BuildingIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import type {
  CapabilityOverrides,
  PlanTier,
  TierCapabilities,
} from "@/lib/plan";

import type { Workspace } from "../use-workspaces-admin";
import type { BooleanCapKey } from "./redact";
import { WorkspaceCard } from "./workspace-card";

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-foreground font-medium tabular-nums">{n}</span>
      <span>{label}</span>
    </span>
  );
}

function Sep() {
  return (
    <span aria-hidden className="text-muted-foreground/50">
      ·
    </span>
  );
}

interface WorkspacesTabProps {
  workspaces: Workspace[];
  isLoading: boolean;
  error: string | null;
  isMutating: boolean;
  tierCounts: Record<PlanTier, number>;
  overrideCount: number;
  currentOrgId: string | null;
  canManage: boolean;
  onSetTier: (orgId: string, tier: PlanTier) => void;
  onSetOverride: <K extends keyof TierCapabilities>(
    orgId: string,
    key: K,
    value: TierCapabilities[K] | null
  ) => void;
  onCycleBooleanOverride: (
    orgId: string,
    overrides: CapabilityOverrides,
    key: BooleanCapKey
  ) => void;
}

export function WorkspacesTab({
  workspaces,
  isLoading,
  error,
  isMutating,
  tierCounts,
  overrideCount,
  currentOrgId,
  canManage,
  onSetTier,
  onSetOverride,
  onCycleBooleanOverride,
}: WorkspacesTabProps) {
  return (
    <TabsContent value="workspaces" className="flex min-h-0 flex-1 flex-col">
      <div className="text-muted-foreground mb-3 flex flex-wrap items-baseline gap-x-1.5 text-xs">
        <Stat n={workspaces.length} label="workspaces" />
        <Sep />
        <Stat n={tierCounts.free ?? 0} label="free" />
        <Sep />
        <Stat n={tierCounts.plus ?? 0} label="plus" />
        <Sep />
        <Stat n={tierCounts.pro ?? 0} label="pro" />
        <Sep />
        <Stat n={overrideCount} label="with overrides" />
      </div>

      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : workspaces.length === 0 ? (
          <div className="text-muted-foreground py-8 text-center">
            <BuildingIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p className="text-xs">No workspaces yet</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                isCurrent={workspace.id === currentOrgId}
                isMutating={isMutating}
                canManage={canManage}
                onSetTier={onSetTier}
                onSetOverride={onSetOverride}
                onCycleBooleanOverride={onCycleBooleanOverride}
              />
            ))}
          </div>
        )}
      </div>
    </TabsContent>
  );
}
