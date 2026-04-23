import type { Button as ButtonPrimitive } from "@base-ui/react/button";
import type { VariantProps } from "class-variance-authority";
import { useHotkeys } from "react-hotkeys-hook";

import { Button } from "@/components/ui/button";
import type { buttonVariants } from "@/components/ui/button";

interface HotkeyButtonProps
  extends ButtonPrimitive.Props, VariantProps<typeof buttonVariants> {
  hotkey?: string;
  hotkeyEnabled?: boolean;
  onHotkeyPress?: () => void;
  scope?: string;
}

export function HotkeyButton({
  hotkey,
  hotkeyEnabled = true,
  onHotkeyPress,
  disabled,
  scope,
  ...props
}: HotkeyButtonProps) {
  useHotkeys(hotkey ?? "", onHotkeyPress ?? (() => {}), {
    enableOnFormTags: false,
    enabled: Boolean(hotkey && onHotkeyPress && hotkeyEnabled && !disabled),
    preventDefault: true,
    scopes: scope ? [scope] : undefined,
  });

  return <Button disabled={disabled} {...props} />;
}
