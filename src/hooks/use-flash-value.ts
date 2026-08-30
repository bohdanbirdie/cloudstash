import { useCallback, useEffect, useState } from "react";

interface Flash<T> {
  readonly value: T | null;
  // Distinguishes flashing the same value twice, so the timer restarts.
  readonly nonce: number;
}

/**
 * Like `useFlashFlag`, but remembers *which* value was flashed. A consumer can
 * then confirm the specific item it is showing rather than trusting that
 * something, somewhere, happened.
 */
export function useFlashValue<T>(durationMs = 2000) {
  const [flash, setFlash] = useState<Flash<T>>({ nonce: 0, value: null });

  useEffect(() => {
    if (flash.value === null) return;
    const id = setTimeout(
      () => setFlash({ nonce: 0, value: null }),
      durationMs
    );
    return () => clearTimeout(id);
  }, [flash, durationMs]);

  const trigger = useCallback(
    (value: T) => setFlash((current) => ({ nonce: current.nonce + 1, value })),
    []
  );
  const reset = useCallback(() => setFlash({ nonce: 0, value: null }), []);

  return { value: flash.value, trigger, reset };
}
