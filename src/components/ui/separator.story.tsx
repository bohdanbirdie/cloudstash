import type { Meta, StoryObj } from "@storybook/react-vite";

import { Separator } from "./separator";

const meta = {
  title: "Primitives/Separator",
  component: Separator,
} satisfies Meta<typeof Separator>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid w-80 gap-6 text-xs">
      <div className="grid gap-3">
        <span>Saved links</span>
        <Separator />
        <span className="text-muted-foreground">Recently viewed</span>
      </div>
      <div className="flex h-5 items-center gap-3">
        <span>All</span>
        <Separator orientation="vertical" />
        <span>Unread</span>
        <Separator orientation="vertical" />
        <span>Archived</span>
      </div>
    </div>
  ),
};
