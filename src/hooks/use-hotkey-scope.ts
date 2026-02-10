import { useEffect } from "react";
import { useHotkeysContext } from "react-hotkeys-hook";

export function useHotkeyScope(
  scope: string,
  options?: { enabled?: boolean; disableScopes?: string[] }
) {
  const { enableScope, disableScope } = useHotkeysContext();
  const enabled = options?.enabled ?? true;
  const disableScopes = options?.disableScopes;

  useEffect(() => {
    if (!enabled) return;
    disableScopes?.forEach((s) => disableScope(s));
    enableScope(scope);
    return () => {
      disableScope(scope);
      disableScopes?.forEach((s) => enableScope(s));
    };
  }, [scope, enabled, disableScopes, enableScope, disableScope]);
}
