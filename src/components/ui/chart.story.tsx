import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent } from "./chart";
import type { ChartConfig } from "./chart";

const data = [
  { month: "Jan", saved: 34 },
  { month: "Feb", saved: 48 },
  { month: "Mar", saved: 41 },
  { month: "Apr", saved: 63 },
  { month: "May", saved: 57 },
];

const config = {
  saved: { label: "Saved links", color: "var(--primary)" },
} satisfies ChartConfig;

const meta = {
  title: "Primitives/Chart",
  component: ChartContainer,
  args: {
    config,
    children: <BarChart data={data} />,
  },
} satisfies Meta<typeof ChartContainer>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <ChartContainer config={config} className="h-64 w-[32rem] aspect-auto">
      <BarChart data={data} margin={{ top: 12, right: 8, left: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar
          dataKey="saved"
          fill="var(--color-saved)"
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  ),
};
