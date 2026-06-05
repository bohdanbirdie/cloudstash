import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";

import type { ActivityStats } from "./use-activity-stats";

const WEEK_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function formatWeek(iso: string): string {
  return `Week of ${WEEK_FMT.format(new Date(`${iso}T00:00:00Z`))}`;
}

const growthConfig = {
  signups: { label: "New per week", color: "var(--muted-foreground)" },
  cumulative: { label: "Total users", color: "var(--primary)" },
} satisfies ChartConfig;

export function GrowthChart({ data }: { data: ActivityStats["userGrowth"] }) {
  return (
    <ChartContainer config={growthConfig} className="aspect-auto h-44 w-full">
      <ComposedChart data={data} margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis
          dataKey="weekStart"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(value: string) => value.slice(5)}
        />
        <YAxis yAxisId="left" hide />
        <YAxis yAxisId="right" orientation="right" hide />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(value) => formatWeek(String(value))}
            />
          }
        />
        <Bar
          yAxisId="left"
          dataKey="signups"
          fill="var(--color-signups)"
          fillOpacity={0.45}
          radius={[3, 3, 0, 0]}
          isAnimationActive={false}
        />
        <Line
          yAxisId="right"
          dataKey="cumulative"
          type="monotone"
          stroke="var(--color-cumulative)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <ChartLegend content={<ChartLegendContent />} />
      </ComposedChart>
    </ChartContainer>
  );
}

interface SparkPoint {
  i: number;
  value: number;
  label?: string;
}

export function Sparkline({
  data,
  weekStarts,
  valueLabel,
  unit = "count",
  className = "aspect-auto h-9 w-full",
}: {
  data: number[];
  weekStarts?: string[];
  valueLabel: string;
  unit?: "count" | "percent";
  className?: string;
}) {
  const gradientId = `spark-${useId().replace(/:/g, "")}`;
  if (data.length < 2) return null;
  const points: SparkPoint[] = data.map((value, i) => ({
    i,
    value,
    label: weekStarts?.[i],
  }));
  const config = {
    value: { label: valueLabel, color: "var(--primary)" },
  } satisfies ChartConfig;
  return (
    <ChartContainer
      config={config}
      className={className}
      initialDimension={{ width: 100, height: 36 }}
    >
      <AreaChart
        data={points}
        margin={{ top: 6, bottom: 6, left: 0, right: 0 }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="0%"
              stopColor="var(--color-value)"
              stopOpacity={0.3}
            />
            <stop
              offset="100%"
              stopColor="var(--color-value)"
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <ChartTooltip
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const wk = (payload?.[0]?.payload as SparkPoint | undefined)
                  ?.label;
                return wk ? formatWeek(wk) : "";
              }}
              formatter={(value) => {
                const n = Array.isArray(value)
                  ? Number(value[0])
                  : Number(value);
                return (
                  <>
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: "var(--color-value)" }}
                    />
                    <div className="flex flex-1 items-center justify-between leading-none">
                      <span className="text-muted-foreground">
                        {valueLabel}
                      </span>
                      <span className="font-mono font-medium text-foreground tabular-nums">
                        {unit === "percent" ? `${n}%` : n.toLocaleString()}
                      </span>
                    </div>
                  </>
                );
              }}
            />
          }
        />
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
          activeDot={{ r: 2.5, strokeWidth: 0, fill: "var(--color-value)" }}
        />
      </AreaChart>
    </ChartContainer>
  );
}
