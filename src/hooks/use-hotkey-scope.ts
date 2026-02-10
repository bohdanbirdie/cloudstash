import { useEffect } from "react";
import { useHotkeysContext } from "react-hotkeys-hook";

export function useHotkeyScope(
  scope: string,
  options?: { enabled?: boolean; disableScopes?: string[] }
) {
  const { enableScope, disableScope } = useHotkeysContext();
  const enabled = options?.enabled ?? true;
  const disableScopesKey = options?.disableScopes?.join(",") ?? "";

  useEffect(() => {
    if (!enabled) return;
    const scopesToDisable = disableScopesKey ? disableScopesKey.split(",") : [];
    scopesToDisable.forEach((s) => disableScope(s));
    enableScope(scope);
    return () => {
      disableScope(scope);
      scopesToDisable.forEach((s) => enableScope(s));
    };
  }, [scope, enabled, disableScopesKey, enableScope, disableScope]);
}
