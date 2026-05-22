const CACHE_LIMIT = 1024;
const cache = new Map<string, string>();

export function decodeHtmlEntities(text: string): string {
  if (!text || !text.includes("&")) {
    return text;
  }
  const cached = cache.get(text);
  if (cached !== undefined) {
    cache.delete(text);
    cache.set(text, cached);
    return cached;
  }
  const el = document.createElement("textarea");
  el.innerHTML = text;
  const decoded = el.value;
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(text, decoded);
  return decoded;
}
