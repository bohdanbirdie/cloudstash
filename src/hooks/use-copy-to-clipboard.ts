import { useCallback, useState } from "react";

import { useFlashFlag } from "@/hooks/use-flash-flag";

// Copies text and exposes enough state for callers to announce success or offer
// a manual-copy fallback when browser clipboard access is unavailable.
export function useCopyToClipboard(durationMs?: number) {
  const { active: copied, trigger } = useFlashFlag(durationMs);
  const [copyFailed, setCopyFailed] = useState(false);

  const copy = useCallback(
    (text: string) => {
      setCopyFailed(false);

      if (!navigator.clipboard) {
        setCopyFailed(true);
        return;
      }

      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopyFailed(false);
          trigger();
        })
        .catch(() => setCopyFailed(true));
    },
    [trigger]
  );

  return { copied, copy, copyFailed };
}
