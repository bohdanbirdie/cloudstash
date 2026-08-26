import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon } from "lucide-react";

import { ToggleGroup, ToggleGroupItem } from "./toggle-group";

const meta = {
  title: "Primitives/ToggleGroup",
  component: ToggleGroup,
} satisfies Meta<typeof ToggleGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid gap-4">
      <ToggleGroup defaultValue={["left"]} aria-label="Text alignment">
        <ToggleGroupItem value="left" aria-label="Align left">
          <AlignLeftIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="center" aria-label="Align center">
          <AlignCenterIcon />
        </ToggleGroupItem>
        <ToggleGroupItem value="right" aria-label="Align right">
          <AlignRightIcon />
        </ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup
        defaultValue={["weekly"]}
        variant="outline"
        spacing={0}
        aria-label="Digest schedule"
      >
        <ToggleGroupItem value="daily">Daily</ToggleGroupItem>
        <ToggleGroupItem value="weekly">Weekly</ToggleGroupItem>
        <ToggleGroupItem value="monthly">Monthly</ToggleGroupItem>
      </ToggleGroup>

      <ToggleGroup
        defaultValue={["design", "engineering"]}
        multiple
        size="sm"
        aria-label="Teams"
      >
        <ToggleGroupItem value="design">Design</ToggleGroupItem>
        <ToggleGroupItem value="engineering">Engineering</ToggleGroupItem>
        <ToggleGroupItem value="product">Product</ToggleGroupItem>
      </ToggleGroup>
    </div>
  ),
};
