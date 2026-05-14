import { useCallback } from "react";

import { useFlashFlag } from "@/hooks/use-flash-flag";

// Copies text and flashes a transient `copied` flag that auto-resets. Clipboard
// errors and unsupported environments are swallowed — copy is best-effort.
export function useCopyToClipboard(durationMs?: number) {
  const { active: copied, trigger } = useFlashFlag(durationMs);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard
        ?.writeText(text)
        .then(trigger)
        .catch(() => {});
    },
    [trigger]
  );

  return { copied, copy };
}
