import { useSearch } from "@tanstack/react-router";

export function useTagFilter() {
  const { tag } = useSearch({ from: "/_authed" });
  return { tag: tag ?? null };
}
