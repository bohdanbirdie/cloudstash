import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsString,
  useQueryStates,
} from "nuqs";

const tagFilterParsers = {
  tags: parseAsArrayOf(parseAsString).withDefault([]),
  untagged: parseAsBoolean.withDefault(false),
};

export function useTagFilter() {
  const [state, setState] = useQueryStates(tagFilterParsers, {
    history: "replace",
  });

  const addTag = (tagId: string) => {
    if (state.tags.includes(tagId)) return;
    void setState({ tags: [...state.tags, tagId], untagged: false });
  };

  const removeTag = (tagId: string) => {
    void setState({ tags: state.tags.filter((id) => id !== tagId) });
  };

  const setTags = (tagIds: string[]) => {
    void setState({ tags: tagIds, untagged: false });
  };

  const setUntagged = (untagged: boolean) => {
    void setState({ tags: [], untagged });
  };

  const clearFilters = () => {
    void setState({ tags: [], untagged: false });
  };

  const hasFilters = state.tags.length > 0 || state.untagged;

  return {
    tags: state.tags,
    untagged: state.untagged,
    hasFilters,
    setTags,
    addTag,
    removeTag,
    setUntagged,
    clearFilters,
  };
}
