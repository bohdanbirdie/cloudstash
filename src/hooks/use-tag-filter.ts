import { parseAsBoolean, parseAsString, useQueryStates } from "nuqs";

const tagFilterParsers = {
  tag: parseAsString,
  untagged: parseAsBoolean.withDefault(false),
};

export function useTagFilter() {
  const [state, setState] = useQueryStates(tagFilterParsers, {
    history: "replace",
  });

  const setTag = (tagId: string | null) => {
    void setState({ tag: tagId, untagged: false });
  };

  const setUntagged = (untagged: boolean) => {
    void setState({ tag: null, untagged });
  };

  const clearFilters = () => {
    void setState({ tag: null, untagged: false });
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
