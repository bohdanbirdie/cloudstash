import type { Meta, StoryObj } from "@storybook/react-vite";

import { Kbd, KbdGroup } from "./kbd";

const meta = {
  title: "Primitives/Kbd",
  component: Kbd,
} satisfies Meta<typeof Kbd>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-6 text-xs">
      <span className="flex items-center gap-2">
        Search
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <span>+</span>
          <Kbd>K</Kbd>
        </KbdGroup>
      </span>
      <span className="flex items-center gap-2">
        Save
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <span>+</span>
          <Kbd>S</Kbd>
        </KbdGroup>
      </span>
      <span className="flex items-center gap-2">
        Close
        <Kbd>Esc</Kbd>
      </span>
    </div>
  ),
};
