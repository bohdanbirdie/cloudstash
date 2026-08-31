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

export const FreePlan: Story = {
  args: {
    libraryItems: [
      { id: "links", label: "Saved links", limit: 100, remaining: 73 },
    ],
    items: [
      { id: "summaries", label: "AI summaries", limit: 10, remaining: 6 },
    ],
  },
};

export const PlusPlan: Story = {
  args: {
    libraryItems: [
      { id: "links", label: "Saved links", limit: 500, remaining: 312 },
    ],
    items: [
      {
        id: "summaries",
        label: "AI summaries",
        limit: 500,
        remaining: 348,
      },
      { id: "api", label: "API calls", limit: 1_000, remaining: 921 },
    ],
  },
};

export const ProPlan: Story = {
  args: {
    libraryItems: [],
    items: [
      {
        id: "summaries",
        label: "AI summaries",
        limit: 1_000,
        remaining: 842,
      },
      {
        id: "assistant",
        label: "Cloudstash Assistant",
        limit: 1_000,
        remaining: 760,
      },
      {
        id: "api",
        label: "API and MCP calls",
        limit: 10_000,
        remaining: 9_647,
      },
      {
        id: "x-sync",
        label: "X bookmark sync",
        limit: 200,
        remaining: 144,
      },
      {
        id: "x-enrichment",
        label: "Enriched X summaries",
        limit: 100,
        remaining: 61,
      },
    ],
  },
};
