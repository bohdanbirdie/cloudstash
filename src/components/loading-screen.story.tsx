import type { Meta, StoryObj } from "@storybook/react-vite";

import { LoadingScreen } from "./loading-screen";

const meta = {
  title: "Surfaces/System/Page loading",
  component: LoadingScreen,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof LoadingScreen>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Current: Story = {};
