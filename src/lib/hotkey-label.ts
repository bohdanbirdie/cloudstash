const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)

const keySymbols: Record<string, { mac: string; other: string }> = {
  meta: { mac: '⌘', other: 'Ctrl' },
  ctrl: { mac: '⌃', other: 'Ctrl' },
  alt: { mac: '⌥', other: 'Alt' },
  shift: { mac: '⇧', other: 'Shift' },
  enter: { mac: '↵', other: '↵' },
  backspace: { mac: '⌫', other: 'Bksp' },
  delete: { mac: '⌦', other: 'Del' },
  escape: { mac: 'Esc', other: 'Esc' },
  tab: { mac: '⇥', other: 'Tab' },
  space: { mac: '␣', other: 'Space' },
  arrowup: { mac: '↑', other: '↑' },
  arrowdown: { mac: '↓', other: '↓' },
  arrowleft: { mac: '←', other: '←' },
  arrowright: { mac: '→', other: '→' },
  bracketleft: { mac: '[', other: '[' },
  bracketright: { mac: ']', other: ']' },
}

export function getHotkeyLabel(hotkey: string): string {
  const parts = hotkey.toLowerCase().split('+')

  const labels = parts.map((part) => {
    const symbol = keySymbols[part]
    if (symbol) return isMac ? symbol.mac : symbol.other
    if (part.length === 1) return part.toUpperCase()
    return part.charAt(0).toUpperCase() + part.slice(1)
  })

  return isMac ? labels.join('') : labels.join('+')
}

export { isMac }
