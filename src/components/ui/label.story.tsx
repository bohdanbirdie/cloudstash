import type { Meta, StoryObj } from "@storybook/react-vite";

import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "Primitives/Label",
  component: Label,
} satisfies Meta<typeof Label>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid max-w-sm gap-4">
      <div className="grid gap-2">
        <Label htmlFor="label-name">Display name</Label>
        <Input id="label-name" placeholder="Ada Lovelace" />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="label-disabled">Disabled field</Label>
        <Input id="label-disabled" defaultValue="Unavailable" disabled />
      </div>

      <Label>
        <input type="checkbox" defaultChecked />
        Keep me signed in
      </Label>
    </div>
  ),
};
