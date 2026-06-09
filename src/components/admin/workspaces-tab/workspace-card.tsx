import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TIER_CAPABILITIES } from "@/lib/plan";
import type {
  CapabilityOverrides,
  PlanTier,
  TierCapabilities,
} from "@/lib/plan";
import { MICRO_LABEL } from "@/lib/typography";
import { cn } from "@/lib/utils";

import type { Workspace } from "../use-workspaces-admin";
import { BudgetInput } from "./budget-input";
import { CapToggle } from "./cap-toggle";
import {
  BOOLEAN_CAPS,
  cleanWorkspaceName,
  effectiveBoolean,
  IS_DEV,
  redactEmail,
  redactName,
  shortenId,
} from "./redact";
import type { BooleanCapKey } from "./redact";
import { TierPicker } from "./tier-picker";

export function WorkspaceCard({
  workspace,
  isCurrent,
  isMutating,
  canManage,
  onSetTier,
  onSetOverride,
  onCycleBooleanOverride,
}: {
  workspace: Workspace;
  isCurrent: boolean;
  isMutating: boolean;
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
}) {
  const tierDefaults = TIER_CAPABILITIES[workspace.tier];
  const budgetOverride = workspace.overrides.monthlyChatBudgetUsd;
  const shortId = shortenId(workspace.id);
  const displayName = workspace.name ? cleanWorkspaceName(workspace.name) : "";

  return (
    <div
      className={cn(
        "border-border/60 bg-background rounded-md border px-3 py-2.5",
        isCurrent && "bg-primary/[0.03] border-primary/30"
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      "rounded-sm font-mono text-xs cursor-help focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60",
                      {
                        "text-primary": isCurrent,
                        "text-foreground": !isCurrent,
                      }
                    )}
                  >
                    {shortId}
                  </button>
                }
              />
              <TooltipContent>{workspace.id}</TooltipContent>
            </Tooltip>
            {isCurrent && (
              <span
                className={cn(MICRO_LABEL, "text-primary/80")}
                aria-label="Current workspace"
              >
                you
              </span>
            )}
          </div>
          {displayName &&
            (IS_DEV ? (
              <div className="text-muted-foreground truncate text-xs">
                {displayName}
              </div>
            ) : (
              <div className="truncate text-xs">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label="Reveal workspace name"
                        className="text-muted-foreground hover:text-foreground rounded-sm cursor-help focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                      >
                        {redactName(displayName)}
                      </button>
                    }
                  />
                  <TooltipContent>{displayName}</TooltipContent>
                </Tooltip>
              </div>
            ))}
        </div>
        <div className="text-muted-foreground min-w-0 max-w-[40%] truncate text-right text-xs">
          {workspace.creatorEmail == null ? (
            "—"
          ) : IS_DEV ? (
            workspace.creatorEmail
          ) : (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    aria-label="Reveal email"
                    className="hover:text-foreground rounded-sm font-mono text-xs cursor-help focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                  >
                    {redactEmail(workspace.creatorEmail)}
                  </button>
                }
              />
              <TooltipContent>{workspace.creatorEmail}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex items-center gap-1.5">
          <TierPicker
            current={workspace.tier}
            disabled={isMutating || !canManage}
            onChange={(tier) => onSetTier(workspace.id, tier)}
          />
          {workspace.tierSource === "admin" && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className={cn(
                      MICRO_LABEL,
                      "text-muted-foreground/70 hover:text-foreground rounded-sm cursor-help focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
                    )}
                  >
                    manual
                  </button>
                }
              />
              <TooltipContent>
                Set manually — Stripe sync won&apos;t overwrite
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        <div className="flex flex-wrap gap-1">
          {BOOLEAN_CAPS.map((cap) => (
            <CapToggle
              key={cap.key}
              effective={effectiveBoolean(
                workspace.overrides[cap.key],
                tierDefaults[cap.key]
              )}
              override={workspace.overrides[cap.key]}
              disabled={isMutating || !canManage}
              label={cap.label}
              short={cap.short}
              onClick={() =>
                onCycleBooleanOverride(
                  workspace.id,
                  workspace.overrides,
                  cap.key
                )
              }
            />
          ))}
        </div>

        <div className="ml-auto">
          <BudgetInput
            override={budgetOverride}
            tierDefault={tierDefaults.monthlyChatBudgetUsd}
            disabled={isMutating || !canManage}
            onCommit={(value) =>
              onSetOverride(workspace.id, "monthlyChatBudgetUsd", value)
            }
            onClear={() =>
              onSetOverride(workspace.id, "monthlyChatBudgetUsd", null)
            }
          />
        </div>
      </div>
    </div>
  );
}
