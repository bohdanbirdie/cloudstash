import type { Meta, StoryObj } from "@storybook/react-vite";

import { BrandLockup } from "@/components/brand-lockup";
import { cn } from "@/lib/utils";

function LockupSurface() {
  return (
    <div className="flex min-h-screen flex-wrap items-center justify-center gap-12 bg-background p-10">
      <Sample label="Plain">
        <BrandLockup />
      </Sample>
      <Sample label="Branded tile">
        <BrandLockup variant="branded" />
      </Sample>
      <Sample label="On dark" surfaceClassName="bg-zinc-900">
        <BrandLockup className="text-white" />
      </Sample>
      <Sample label="On primary" surfaceClassName="bg-primary">
        <BrandLockup className="text-primary-foreground" />
      </Sample>
    </div>
  );
}

function Sample({
  label,
  surfaceClassName,
  children,
}: {
  label: string;
  surfaceClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={cn(
          "flex items-center justify-center rounded-lg px-10 py-8",
          surfaceClassName ?? "border border-border"
        )}
      >
        {children}
      </div>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

const meta = {
  title: "Brand/Lockup",
  component: LockupSurface,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof LockupSurface>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Gallery: Story = {};
