const cache = new Map<string, string>();

export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes("&")) {
    return text;
  }
  const cached = cache.get(text);
  if (cached !== undefined) {
    return cached;
  }
  const el = document.createElement("textarea");
  el.innerHTML = text;
  const decoded = el.value;
  cache.set(text, decoded);
  return decoded;
}
