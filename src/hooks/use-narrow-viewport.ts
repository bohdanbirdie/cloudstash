import { useSyncExternalStore } from "react";

// Complement of the Tailwind `lg` breakpoint. Derived from the *same* 1024px
// threshold the CSS layout uses, so there's no fractional-px gap where neither
// the right pane nor the mobile sheet shows.
const WIDE_QUERY = "(min-width: 1024px)";

function subscribe(callback: () => void) {
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

export function useNarrowViewport() {
  return useSyncExternalStore(
    subscribe,
    () => !window.matchMedia(WIDE_QUERY).matches,
    () => false
  );
}
