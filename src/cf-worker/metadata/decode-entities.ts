import { decodeHTML } from "entities";

export function decodeHtmlEntities(text: string): string {
  return decodeHTML(text);
}
