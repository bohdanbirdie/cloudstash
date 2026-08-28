import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { LoginSurface } from "@/routes/login";

const meta = {
  title: "Surfaces/Auth/Login",
  component: LoginSurface,
  parameters: { layout: "fullscreen" },
  args: {
    onContinue: fn(),
    privacyLink: <a href="#privacy">Privacy Policy</a>,
    termsLink: <a href="#terms">Terms of Service</a>,
  },
  argTypes: {
    onContinue: { table: { disable: true } },
    privacyLink: { table: { disable: true } },
    termsLink: { table: { disable: true } },
  },
} satisfies Meta<typeof LoginSurface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Current: Story = {};
