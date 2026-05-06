export const MAX_TAG_NAME_LENGTH = 16;

export function isValidTagName(input: string): boolean {
  return input.length > 0 && input.length <= MAX_TAG_NAME_LENGTH;
}

export function sanitizeTagName(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function deriveNewTag(
  input: string,
  existingTagIds: ReadonlySet<string>
): { id: string; name: string } | null {
  const name = sanitizeTagName(input);
  if (!isValidTagName(name)) return null;
  if (existingTagIds.has(name)) return null;
  return { id: name, name };
}
