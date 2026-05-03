import { useCallback, useEffect, useState } from "react";

export function useFlashFlag(durationMs = 2000) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setActive(false), durationMs);
    return () => clearTimeout(id);
  }, [active, durationMs]);

  const trigger = useCallback(() => setActive(true), []);
  const reset = useCallback(() => setActive(false), []);

  return { active, trigger, reset };
}
