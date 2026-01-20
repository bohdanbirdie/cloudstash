import { useHotkeys } from 'react-hotkeys-hook'
import { Button, buttonVariants } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { useModifierHold } from '@/hooks/use-modifier-hold'
import { getHotkeyLabel } from '@/lib/hotkey-label'
import type { VariantProps } from 'class-variance-authority'
import type { Button as ButtonPrimitive } from '@base-ui/react/button'

interface HotkeyButtonProps extends ButtonPrimitive.Props, VariantProps<typeof buttonVariants> {
  kbdLabel?: string
  hotkey?: string
  hotkeyEnabled?: boolean
  onHotkeyPress?: () => void
}

export function HotkeyButton({
  kbdLabel,
  hotkey,
  hotkeyEnabled = true,
  onHotkeyPress,
  disabled,
  ...props
}: HotkeyButtonProps) {
  const showHints = useModifierHold()

  useHotkeys(hotkey ?? '', onHotkeyPress ?? (() => {}), {
    enabled: Boolean(hotkey && onHotkeyPress && hotkeyEnabled && !disabled),
    preventDefault: true,
    enableOnFormTags: true,
  })

  const label = kbdLabel ?? (hotkey ? getHotkeyLabel(hotkey) : '')

  return (
    <div className='relative'>
      <Button disabled={disabled} {...props} />
      {showHints && label && (
        <Kbd className='absolute -top-7 left-1/2 -translate-x-1/2'>{label}</Kbd>
      )}
    </div>
  )
}
