import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "./input";

const meta = {
  title: "Primitives/Input",
  component: Input,
} satisfies Meta<typeof Input>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid max-w-lg gap-3 sm:grid-cols-2">
      <Input aria-label="Empty input" placeholder="Placeholder" />
      <Input aria-label="Filled input" defaultValue="Filled value" />
      <Input
        aria-label="Invalid input"
        defaultValue="Invalid value"
        aria-invalid
      />
      <Input
        aria-label="Disabled input"
        defaultValue="Disabled value"
        disabled
      />
      <Input
        aria-label="Email input"
        type="email"
        placeholder="you@example.com"
      />
      <Input aria-label="File input" type="file" />
    </div>
  ),
};
