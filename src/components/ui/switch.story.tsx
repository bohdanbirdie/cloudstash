import type { Meta, StoryObj } from "@storybook/react-vite";

import { Label } from "./label";
import { Switch } from "./switch";

const meta = {
  title: "Primitives/Switch",
  component: Switch,
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid w-72 gap-4">
      <Label className="justify-between">
        Default, off
        <Switch aria-label="Default, off" />
      </Label>
      <Label className="justify-between">
        Default, on
        <Switch aria-label="Default, on" defaultChecked />
      </Label>
      <Label className="justify-between">
        Small
        <Switch aria-label="Small" size="sm" defaultChecked />
      </Label>
      <Label className="justify-between">
        Disabled
        <Switch aria-label="Disabled" defaultChecked disabled />
      </Label>
    </div>
  ),
};
