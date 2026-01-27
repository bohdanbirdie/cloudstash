const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const keySymbols: Record<string, { mac: string; other: string }> = {
  alt: { mac: "⌥", other: "Alt" },
  arrowdown: { mac: "↓", other: "↓" },
  arrowleft: { mac: "←", other: "←" },
  arrowright: { mac: "→", other: "→" },
  arrowup: { mac: "↑", other: "↑" },
  backspace: { mac: "⌫", other: "Bksp" },
  bracketleft: { mac: "[", other: "[" },
  bracketright: { mac: "]", other: "]" },
  ctrl: { mac: "⌃", other: "Ctrl" },
  delete: { mac: "⌦", other: "Del" },
  enter: { mac: "↵", other: "↵" },
  escape: { mac: "Esc", other: "Esc" },
  meta: { mac: "⌘", other: "Ctrl" },
  shift: { mac: "⇧", other: "Shift" },
  space: { mac: "␣", other: "Space" },
  tab: { mac: "⇥", other: "Tab" },
};

export function getHotkeyLabel(hotkey: string): string {
  const parts = hotkey.toLowerCase().split("+");

  const labels = parts.map((part) => {
    const symbol = keySymbols[part];
    if (symbol) {
      return isMac ? symbol.mac : symbol.other;
    }
    if (part.length === 1) {
      return part.toUpperCase();
    }
    return part.charAt(0).toUpperCase() + part.slice(1);
  });

  return isMac ? labels.join("") : labels.join("+");
}

export { isMac };
