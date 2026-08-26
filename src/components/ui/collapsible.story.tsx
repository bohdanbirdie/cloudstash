import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "./button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible";

const meta = {
  title: "Primitives/Collapsible",
  component: Collapsible,
} satisfies Meta<typeof Collapsible>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <Collapsible className="w-72 space-y-2">
      <CollapsibleTrigger render={<Button variant="outline" />}>
        Show link details
      </CollapsibleTrigger>
      <CollapsibleContent className="rounded-md border p-3 text-xs text-muted-foreground">
        Saved from example.com on August 26, 2026.
      </CollapsibleContent>
    </Collapsible>
  ),
};
