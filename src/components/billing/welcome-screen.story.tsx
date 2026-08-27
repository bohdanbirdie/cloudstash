import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { WelcomeScreen } from "./welcome-screen";

const meta = {
  title: "Surfaces/Billing/Welcome",
  component: WelcomeScreen,
  parameters: {
    layout: "fullscreen",
  },
  args: {
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    isFallback: false,
    isLoading: false,
    libraryLink: <a href="#library">Go to your library</a>,
    onRetry: fn(),
    onResume: fn(),
    tier: "pro",
  },
  argTypes: {
    currentPeriodEnd: { control: "text" },
    libraryLink: { table: { disable: true } },
    onRetry: { table: { disable: true } },
    tier: {
      control: "inline-radio",
      options: ["free", "plus", "pro"],
    },
  },
} satisfies Meta<typeof WelcomeScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const ConfirmationDelayed: Story = {
  args: {
    isFallback: true,
  },
};

export const Free: Story = {
  args: {
    tier: "free",
  },
};

export const Plus: Story = {
  args: {
    currentPeriodEnd: "2027-08-27T00:00:00.000Z",
    tier: "plus",
  },
};

export const Pro: Story = {
  args: {
    currentPeriodEnd: "2027-08-27T00:00:00.000Z",
  },
};

export const ProRenewalDateUnavailable: Story = {};

export const PlusCancellationScheduled: Story = {
  args: {
    cancelAtPeriodEnd: true,
    currentPeriodEnd: "2026-09-30T00:00:00.000Z",
    tier: "plus",
  },
};

export const ProCancellationScheduled: Story = {
  args: {
    cancelAtPeriodEnd: true,
    currentPeriodEnd: "2026-09-30T00:00:00.000Z",
  },
};

export const CancellationDateUnavailable: Story = {
  args: {
    cancelAtPeriodEnd: true,
    currentPeriodEnd: null,
    tier: "plus",
  },
};
