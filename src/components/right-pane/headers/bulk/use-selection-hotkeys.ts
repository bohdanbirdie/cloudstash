import { useHotkeys } from "react-hotkeys-hook";

export function useSelectionHotkey(
  key: string,
  handler: () => void,
  enabled: boolean
) {
  useHotkeys(key, handler, {
    enabled,
    enableOnFormTags: ["option"],
    preventDefault: true,
    scopes: ["selection"],
  });
}
