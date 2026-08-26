import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight } from "lucide-react";

import { Button } from "./button";

const variants = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;

const sizes = ["xs", "sm", "default", "lg"] as const;

const iconSizes = ["icon-xs", "icon-sm", "icon", "icon-lg"] as const;

const meta = {
  title: "Primitives/Button",
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid gap-6">
      <div className="grid grid-cols-[6rem_repeat(2,auto)] items-center gap-2">
        <span />
        <span className="text-xs text-muted-foreground">Default</span>
        <span className="text-xs text-muted-foreground">Disabled</span>
        {variants.map((variant) => (
          <div className="contents" key={variant}>
            <span className="text-xs capitalize text-muted-foreground">
              {variant}
            </span>
            <Button variant={variant}>Button</Button>
            <Button variant={variant} disabled>
              Button
            </Button>
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        <span className="text-xs text-muted-foreground">Sizes</span>
        <div className="flex items-end gap-2">
          {sizes.map((size) => (
            <Button size={size} key={size}>
              {size}
            </Button>
          ))}
          {iconSizes.map((size) => (
            <Button size={size} aria-label={size} key={size}>
              <ArrowRight />
            </Button>
          ))}
        </div>
      </div>
    </div>
  ),
};
