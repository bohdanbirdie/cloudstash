import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./card";

const meta = {
  title: "Primitives/Card",
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid w-[34rem] grid-cols-2 gap-4">
      {(["default", "sm"] as const).map((size) => (
        <Card key={size} size={size}>
          <CardHeader>
            <CardTitle>Reading list</CardTitle>
            <CardDescription>Links saved this week</CardDescription>
            <CardAction className="text-muted-foreground">24</CardAction>
          </CardHeader>
          <CardContent>
            Keep useful references close and return to them when you have time.
          </CardContent>
          <CardFooter className="border-t text-muted-foreground">
            {size === "sm" ? "Compact card" : "Default card"}
          </CardFooter>
        </Card>
      ))}
    </div>
  ),
};
