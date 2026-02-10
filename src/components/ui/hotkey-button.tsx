import { type Button as ButtonPrimitive } from "@base-ui/react/button";
import { type VariantProps } from "class-variance-authority";
import { useHotkeys } from "react-hotkeys-hook";

import { Button, type buttonVariants } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { useModifierHold } from "@/hooks/use-modifier-hold";
import { getHotkeyLabel } from "@/lib/hotkey-label";

interface HotkeyButtonProps
  extends ButtonPrimitive.Props, VariantProps<typeof buttonVariants> {
  kbdLabel?: string;
  hotkey?: string;
  hotkeyEnabled?: boolean;
  onHotkeyPress?: () => void;
  scope?: string;
}

export function HotkeyButton({
  kbdLabel,
  hotkey,
  hotkeyEnabled = true,
  onHotkeyPress,
  disabled,
  scope,
  ...props
}: HotkeyButtonProps) {
  const showHints = useModifierHold();

  useHotkeys(hotkey ?? "", onHotkeyPress ?? (() => {}), {
    enableOnFormTags: false,
    enabled: Boolean(hotkey && onHotkeyPress && hotkeyEnabled && !disabled),
    preventDefault: true,
    scopes: scope ? [scope] : undefined,
  });

  const label = kbdLabel ?? (hotkey ? getHotkeyLabel(hotkey) : "");

  return (
    <div className="relative">
      <Button disabled={disabled} {...props} />
      {showHints && label && (
        <Kbd className="absolute -top-7 left-1/2 -translate-x-1/2">{label}</Kbd>
      )}
    </div>
  );
}
