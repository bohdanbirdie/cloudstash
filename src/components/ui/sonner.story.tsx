import type { Meta, StoryObj } from "@storybook/react-vite";
import { toast } from "sonner";

import { Button } from "./button";
import { Toaster } from "./sonner";

const meta = {
  title: "Primitives/Sonner",
  component: Toaster,
} satisfies Meta<typeof Toaster>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <>
      <Button
        variant="outline"
        onClick={() =>
          toast.success("Link saved", {
            description: "It is now available from your library.",
          })
        }
      >
        Show toast
      </Button>
      <Toaster theme="light" position="bottom-right" />
    </>
  ),
};
