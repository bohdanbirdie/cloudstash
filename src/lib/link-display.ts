import { decodeHtmlEntities } from "./decode-html-entities";

interface LinkLike {
  title: string | null;
  description?: string | null;
  url: string;
}

export function displayTitle(link: LinkLike): string {
  if (link.title) return decodeHtmlEntities(link.title);
  const parsed = URL.parse(link.url);
  return parsed ? `${parsed.origin}${parsed.pathname}` : link.url;
}

export function displayDescription(link: LinkLike): string | null {
  return link.description ? decodeHtmlEntities(link.description) : null;
}
