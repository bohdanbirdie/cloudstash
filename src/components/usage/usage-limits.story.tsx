import type { Meta, StoryObj } from "@storybook/react-vite";

import { UsageLimits } from "./usage-limits";

const meta = {
  title: "Surfaces/Settings/Usage limits",
  component: UsageLimits,
  parameters: { layout: "centered" },
  decorators: [
    (Story) => (
      <div className="w-96 max-w-[calc(100vw-2rem)]">
        <Story />
      </div>
    ),
  ],
  args: {
    items: [
      {
        id: "assistant",
        label: "Cloudstash Assistant",
        limit: 1_000,
        remaining: 842,
      },
    ],
    resetsAt: "2026-09-17T14:30:00.000Z",
  },
} satisfies Meta<typeof UsageLimits>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NearLimit: Story = {
  args: {
    items: [
      {
        id: "assistant",
        label: "Cloudstash Assistant",
        limit: 1_000,
        remaining: 84,
      },
    ],
  },
};

export const Exhausted: Story = {
  args: {
    items: [
      {
        id: "assistant",
        label: "Cloudstash Assistant",
        limit: 1_000,
        remaining: 0,
      },
    ],
  },
};

export const SharedReset: Story = {
  args: {
    items: [
      {
        id: "assistant",
        label: "Cloudstash Assistant",
        limit: 1_000,
        remaining: 842,
      },
      {
        id: "summaries",
        label: "AI summaries",
        limit: 100,
        remaining: 37,
      },
      {
        id: "enrichment",
        label: "Enriched X summaries",
        limit: 25,
        remaining: 11,
      },
    ],
  },
};
