import { useSearch } from "@tanstack/react-router";

export function useTagFilter() {
  const tag = useSearch({
    from: "/_authed",
    select: (s) => s.tag ?? null,
  });
  return { tag };
}
