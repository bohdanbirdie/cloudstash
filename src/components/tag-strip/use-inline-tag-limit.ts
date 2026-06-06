import { useSyncExternalStore } from "react";

const MEDIUM_QUERY = "(min-width: 1024px)";
const WIDE_QUERY = "(min-width: 1440px)";

const INLINE_LIMIT_NARROW = 4;
const INLINE_LIMIT_MEDIUM = 7;
const INLINE_LIMIT_WIDE = 10;

let mqMedium: MediaQueryList | undefined;
let mqWide: MediaQueryList | undefined;

function queries() {
  mqMedium ??= window.matchMedia(MEDIUM_QUERY);
  mqWide ??= window.matchMedia(WIDE_QUERY);
  return [mqMedium, mqWide] as const;
}

function subscribe(callback: () => void) {
  const [medium, wide] = queries();
  medium.addEventListener("change", callback);
  wide.addEventListener("change", callback);
  return () => {
    medium.removeEventListener("change", callback);
    wide.removeEventListener("change", callback);
  };
}

function read() {
  const [medium, wide] = queries();
  if (wide.matches) return INLINE_LIMIT_WIDE;
  if (medium.matches) return INLINE_LIMIT_MEDIUM;
  return INLINE_LIMIT_NARROW;
}

export function useInlineTagLimit() {
  return useSyncExternalStore(subscribe, read, () => INLINE_LIMIT_NARROW);
}
