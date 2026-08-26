import type { Meta, StoryObj } from "@storybook/react-vite";
import { BoldIcon, ItalicIcon, UnderlineIcon } from "lucide-react";

import { Toggle } from "./toggle";

const meta = {
  title: "Primitives/Toggle",
  component: Toggle,
} satisfies Meta<typeof Toggle>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Toggle aria-label="Bold">
          <BoldIcon />
        </Toggle>
        <Toggle aria-label="Italic" defaultPressed>
          <ItalicIcon />
        </Toggle>
        <Toggle aria-label="Underline" disabled>
          <UnderlineIcon />
        </Toggle>
      </div>

      <div className="flex items-center gap-2">
        {(["sm", "default", "lg"] as const).map((size) => (
          <Toggle key={size} size={size} variant="outline">
            {size}
          </Toggle>
        ))}
      </div>
    </div>
  ),
};
