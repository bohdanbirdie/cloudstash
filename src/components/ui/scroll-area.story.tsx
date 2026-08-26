import type { Meta, StoryObj } from "@storybook/react-vite";

import { ScrollArea } from "./scroll-area";

const savedLinks = Array.from(
  { length: 18 },
  (_, index) => `Saved link ${String(index + 1).padStart(2, "0")}`
);

const meta = {
  title: "Primitives/ScrollArea",
  component: ScrollArea,
} satisfies Meta<typeof ScrollArea>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <ScrollArea className="h-48 w-72 rounded-md border">
      <div className="p-3">
        <h2 className="mb-2 text-sm font-medium">Recently saved</h2>
        <ul className="space-y-2 text-xs text-muted-foreground">
          {savedLinks.map((link) => (
            <li key={link}>{link}</li>
          ))}
        </ul>
      </div>
    </ScrollArea>
  ),
};
