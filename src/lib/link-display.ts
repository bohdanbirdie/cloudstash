import { decodeHtmlEntities } from "./decode-html-entities";

interface LinkLike {
  title: string | null;
  description?: string | null;
  url: string;
}

export function displayTitle(link: LinkLike): string {
  return link.title ? decodeHtmlEntities(link.title) : link.url;
}

export function displayDescription(link: LinkLike): string | null {
  return link.description ? decodeHtmlEntities(link.description) : null;
}
