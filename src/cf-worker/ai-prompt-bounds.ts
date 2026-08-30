const MAX_EXISTING_TAGS_IN_PROMPT = 100;

const compareTagNames = (
  left: { readonly name: string },
  right: { readonly name: string }
): number => {
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
};

export const selectTagVocabulary = <T extends { readonly name: string }>(
  tags: ReadonlyArray<T>
): ReadonlyArray<T> =>
  tags.toSorted(compareTagNames).slice(0, MAX_EXISTING_TAGS_IN_PROMPT);
