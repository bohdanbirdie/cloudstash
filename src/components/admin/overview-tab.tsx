import { ActivityIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";

import { SourceBreakdown, TierBreakdown } from "./overview-breakdowns";
import { BusinessStrip } from "./overview-business-strip";
import { GrowthChart } from "./overview-charts";
import { fmtDepth, fmtNum } from "./overview-format";
import { CohortFunnelView } from "./overview-funnel";
import { HeroCard } from "./overview-hero-card";
import { MetricCard } from "./overview-metric-card";
import { RetentionHeatmap } from "./overview-retention";
import { ErrorState, Section, StaleNote } from "./overview-states";
import type { ActivityStats } from "./use-activity-stats";

interface OverviewTabProps {
  data: ActivityStats | null;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
}

export function OverviewTab({
  data,
  isLoading,
  error,
  onRetry,
}: OverviewTabProps) {
  const weekStarts = data?.userGrowth.map((p) => p.weekStart);

  return (
    <TabsContent value="overview" className="flex min-h-0 flex-1 flex-col">
      {isLoading && !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : error && !data ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !data ? (
        <div className="py-8 text-center text-muted-foreground">
          <ActivityIcon className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-xs">No activity data yet</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 space-y-6 overflow-x-hidden overflow-y-auto">
          {error && <StaleNote onRetry={onRetry} />}

          <HeroCard
            ns={data.northStar}
            target={data.targets.paidActivePct}
            weekStarts={weekStarts}
          />

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="New users / week"
              value={fmtNum(data.newUsers.current)}
              sub={`vs ${fmtNum(data.newUsers.prior)} the week before`}
              delta={data.newUsers.delta}
              sparkline={data.newUsers.sparkline}
              sparklineWeeks={weekStarts}
              sparklineLabel="new users"
            />
            <MetricCard
              label="Activation rate"
              value={`${data.activation.rate}%`}
              sub={`${fmtNum(data.activation.activatedCount)} of ${fmtNum(data.activation.cohortSize)} new users saved a link`}
              target={data.targets.activationPct}
              meetsTarget={data.activation.rate >= data.targets.activationPct}
              sparkline={data.activation.sparkline}
              sparklineWeeks={weekStarts}
              sparklineLabel="activation"
              sparklineUnit="percent"
            />
            <MetricCard
              label="Saves per active user"
              value={fmtDepth(data.depth.perActive)}
              sub="links saved per active user, last 7 days"
              delta={data.depth.delta}
              sparkline={data.depth.sparkline}
              sparklineWeeks={weekStarts}
              sparklineLabel="saves per user"
            />
            <MetricCard
              label="Weekly active"
              value={`${data.weeklyActive.activePct}%`}
              sub={`${fmtNum(data.weeklyActive.activeCount)} of ${fmtNum(data.weeklyActive.totalOrgs)} users saved this week`}
              target={data.targets.weeklyActivePct}
              meetsTarget={
                data.weeklyActive.activePct >= data.targets.weeklyActivePct
              }
              sparkline={data.weeklyActive.sparkline}
              sparklineWeeks={weekStarts}
              sparklineLabel="active users"
            />
          </div>

          <Section title="Revenue">
            <BusinessStrip
              pc={data.paidConversion}
              conversionTarget={data.targets.paidConversionPct}
            />
          </Section>

          <Section title="User growth (last 12 weeks)">
            <GrowthChart data={data.userGrowth} />
          </Section>

          <Section title="Where the last 30 days of signups are now">
            <CohortFunnelView funnel={data.cohortFunnel} />
          </Section>

          <Section title="Retention — do new users keep saving?">
            <RetentionHeatmap grid={data.retention} />
          </Section>

          <Section
            title={`Where saves come from · last ${data.sourceWindowDays} days`}
          >
            <SourceBreakdown rows={data.bySource} />
          </Section>

          <Section title="By plan">
            <TierBreakdown
              rows={data.byTier}
              showMrr={data.paidConversion.mrrUsd > 0}
            />
          </Section>

          <p className="max-w-[70ch] text-[11px] text-muted-foreground">
            Signups and growth cover all time. Activation, weekly-active,
            retention, and the funnel only count users since activity tracking
            began — earlier signups are excluded from those rates. The
            paying-active trend applies today’s paying users to past weeks; full
            subscription history is coming. One user = one workspace.
          </p>
        </div>
      )}
    </TabsContent>
  );
}
