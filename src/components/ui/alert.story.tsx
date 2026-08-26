import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertCircleIcon, CheckCircle2Icon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "./alert";

const meta = {
  title: "Primitives/Alert",
  component: Alert,
} satisfies Meta<typeof Alert>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  render: () => (
    <div className="grid w-96 gap-3">
      <Alert>
        <CheckCircle2Icon />
        <AlertTitle>Link saved</AlertTitle>
        <AlertDescription>
          It is now available from your library.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>Could not save link</AlertTitle>
        <AlertDescription>Check the URL and try again.</AlertDescription>
      </Alert>
    </div>
  ),
};
