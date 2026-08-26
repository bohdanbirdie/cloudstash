import type { Meta, StoryObj } from "@storybook/react-vite";

import { Textarea } from "./textarea";

const meta = {
  title: "Primitives/Textarea",
  component: Textarea,
} satisfies Meta<typeof Textarea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid max-w-2xl gap-3 sm:grid-cols-2">
      <Textarea aria-label="Empty textarea" placeholder="Write a short note…" />
      <Textarea
        aria-label="Filled textarea"
        defaultValue="A saved note can grow with its content."
      />
      <Textarea
        aria-label="Invalid textarea"
        defaultValue="Too short"
        aria-invalid
      />
      <Textarea
        aria-label="Disabled textarea"
        defaultValue="This note is read-only."
        disabled
      />
    </div>
  ),
};
