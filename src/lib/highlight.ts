export function getHighlightParts(
  text: string | null | undefined,
  query: string
): Array<{ text: string; highlighted: boolean }> {
  if (!text || !query.trim()) {
    return [{ text: text || "", highlighted: false }];
  }

  // Escape regex special characters
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);

  return parts
    .filter((part) => part.length > 0)
    .map((part) => ({
      text: part,
      highlighted: part.toLowerCase() === query.toLowerCase(),
    }));
}
