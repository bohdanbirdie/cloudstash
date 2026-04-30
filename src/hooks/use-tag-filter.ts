import { parseAsBoolean, parseAsString, useQueryStates } from "nuqs";

import { useSelectionStore } from "@/stores/selection-store";

const tagFilterParsers = {
  tag: parseAsString,
  untagged: parseAsBoolean.withDefault(false),
};

export function useTagFilter() {
  const [state, setState] = useQueryStates(tagFilterParsers, {
    history: "replace",
  });
  const clearSelection = useSelectionStore((s) => s.clear);

  const setTag = (tagId: string | null) => {
    void setState({ tag: tagId, untagged: false });
    clearSelection();
  };

  const setUntagged = (untagged: boolean) => {
    void setState({ tag: null, untagged });
    clearSelection();
  };

  const clearFilters = () => {
    void setState({ tag: null, untagged: false });
    clearSelection();
  };

  const hasFilters = state.tag !== null || state.untagged;

  return {
    tag: state.tag,
    untagged: state.untagged,
    hasFilters,
    setTag,
    setUntagged,
    clearFilters,
  };
}
