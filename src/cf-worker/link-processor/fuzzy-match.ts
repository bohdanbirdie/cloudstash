interface Tag {
  readonly id: string;
  readonly name: string;
}

export function findMatchingTag(
  suggestion: string,
  existingTags: readonly Tag[]
): Tag | null {
  const normalized = suggestion.toLowerCase().trim();

  const exact = existingTags.find((t) => t.name.toLowerCase() === normalized);
  if (exact) return exact;

  const partial = existingTags.find((t) => {
    const existing = t.name.toLowerCase();
    return existing.includes(normalized) || normalized.includes(existing);
  });
  if (partial) return partial;

  return null;
}
