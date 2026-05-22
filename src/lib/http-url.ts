// Rejects non-http(s) schemes; `javascript:`/`data:` would otherwise execute
// when rendered as `<a href>`.
export function parseHttpUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url;
}
