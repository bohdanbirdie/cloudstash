import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";

import { PlanSectionView } from "./plan-section";
import type { PlanSectionViewProps } from "./plan-section";

const meta = {
  title: "Surfaces/Settings/Plan",
  component: PlanSectionView,
  decorators: [
    (Story) => (
      <div className="w-[min(34rem,calc(100vw-2rem))]">
        <Story />
      </div>
    ),
  ],
  args: {
    billingInterval: null,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    onChange: fn(),
    onSelectedIntervalChange: fn(),
    pending: null,
    selectedInterval: "year",
    tier: "free",
  },
  argTypes: {
    billingInterval: {
      control: "select",
      options: [null, "month", "year"],
    },
    currentPeriodEnd: { control: "text" },
    pending: {
      control: "select",
      options: [null, "free", "plus", "pro"],
    },
    selectedInterval: {
      control: "inline-radio",
      options: ["month", "year"],
    },
    tier: {
      control: "inline-radio",
      options: ["free", "plus", "pro"],
    },
  },
} satisfies Meta<typeof PlanSectionView>;

export default meta;

type Story = StoryObj<typeof meta>;

function ControlledPlanStory(args: PlanSectionViewProps) {
  const [, updateArgs] = useArgs<PlanSectionViewProps>();

  return (
    <PlanSectionView
      {...args}
      onChange={(target) => {
        args.onChange(target);
        updateArgs({ pending: target });
      }}
      onSelectedIntervalChange={(selectedInterval) => {
        args.onSelectedIntervalChange(selectedInterval);
        updateArgs({ selectedInterval });
      }}
    />
  );
}

export const Free: Story = {
  render: ControlledPlanStory,
};

export const Plus: Story = {
  args: {
    billingInterval: "year",
    tier: "plus",
  },
  render: ControlledPlanStory,
};

export const Pro: Story = {
  args: {
    billingInterval: "month",
    tier: "pro",
  },
  render: ControlledPlanStory,
};

export const CancellationScheduled: Story = {
  args: {
    billingInterval: "year",
    cancelAtPeriodEnd: true,
    currentPeriodEnd: "2026-09-30T00:00:00.000Z",
    tier: "plus",
  },
  render: ControlledPlanStory,
};
