import type { Meta, StoryObj } from "@storybook/react-vite";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "./input-otp";

const meta = {
  title: "Primitives/InputOTP",
  component: InputOTP,
} satisfies Meta<typeof InputOTP>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  args: {
    maxLength: 6,
    children: null,
  },
  render: () => (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <span className="text-xs font-medium">Verification code</span>
        <InputOTP maxLength={6} defaultValue="123">
          <InputOTPGroup>
            {[0, 1, 2].map((index) => (
              <InputOTPSlot key={index} index={index} />
            ))}
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            {[3, 4, 5].map((index) => (
              <InputOTPSlot key={index} index={index} />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      <InputOTP maxLength={4} defaultValue="2048" disabled>
        <InputOTPGroup>
          {[0, 1, 2, 3].map((index) => (
            <InputOTPSlot key={index} index={index} />
          ))}
        </InputOTPGroup>
      </InputOTP>
    </div>
  ),
};
