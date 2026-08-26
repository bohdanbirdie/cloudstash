import type { Meta, StoryObj } from "@storybook/react-vite";

import { Spinner } from "./spinner";

const meta = {
  title: "Primitives/Spinner",
  component: Spinner,
} satisfies Meta<typeof Spinner>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex items-center gap-5 text-muted-foreground">
      <Spinner className="size-3" />
      <Spinner />
      <Spinner className="size-6" />
      <span className="flex items-center gap-2 text-xs">
        <Spinner /> Loading
      </span>
    </div>
  ),
};
