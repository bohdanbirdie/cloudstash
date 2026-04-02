import type { Document, Element } from "domhandler";
import {
  textContent,
  getElementsByTagName,
  removeElement,
  getAttributeValue,
} from "domutils";
import { parseDocument } from "htmlparser2";

import { decodeHtmlEntities } from "../metadata/decode-entities";

export interface ExtractedContent {
  title: string | null;
  content: string; // plain text content
}

const REMOVE_TAGS = [
  "script",
  "style",
  "nav",
  "footer",
  "aside",
  "iframe",
  "noscript",
  "header",
  "form",
  "button",
];

function cleanText(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

function getCleanText(element: Element | Document): string {
  return cleanText(textContent(element));
}

function findMainContent(doc: Document): Element | Document {
  // Try semantic content tags first
  for (const tag of ["article", "main"]) {
    const elements = getElementsByTagName(tag, doc, true);
    if (elements.length > 0) {
      // Return the largest one by text content
      let best = elements[0];
      let bestLength = getCleanText(best).length;
      for (const el of elements) {
        const len = getCleanText(el).length;
        if (len > bestLength) {
          best = el;
          bestLength = len;
        }
      }
      return best;
    }
  }

  // Try role="main"
  const allElements = getElementsByTagName("*", doc, true);
  for (const el of allElements) {
    if (getAttributeValue(el, "role") === "main") {
      return el;
    }
  }

  // Fall back to body
  const body = getElementsByTagName("body", doc, true);
  if (body.length > 0) {
    return body[0];
  }

  return doc;
}

function extractTitle(doc: Document): string | null {
  // Try <title> tag
  const titleElements = getElementsByTagName("title", doc, true);
  if (titleElements.length > 0) {
    const text = getCleanText(titleElements[0]);
    if (text) {
      return decodeHtmlEntities(text);
    }
  }

  // Try <h1>
  const h1Elements = getElementsByTagName("h1", doc, true);
  if (h1Elements.length > 0) {
    const text = getCleanText(h1Elements[0]);
    if (text) {
      return decodeHtmlEntities(text);
    }
  }

  // Try og:title meta tag
  const metaTags = getElementsByTagName("meta", doc, true);
  for (const meta of metaTags) {
    const property =
      getAttributeValue(meta, "property") || getAttributeValue(meta, "name");
    if (property === "og:title" || property === "twitter:title") {
      const content = getAttributeValue(meta, "content");
      if (content) {
        return decodeHtmlEntities(content);
      }
    }
  }

  return null;
}

function removeNoiseElements(doc: Document): void {
  for (const tag of REMOVE_TAGS) {
    const elements = getElementsByTagName(tag, doc, true);
    for (const el of elements) {
      removeElement(el);
    }
  }
}

export function extractContent(
  html: string,
  _url: string
): ExtractedContent | null {
  const doc = parseDocument(html);

  // Extract title before removing elements
  const title = extractTitle(doc);

  // Remove noise elements
  removeNoiseElements(doc);

  // Find main content
  const mainContent = findMainContent(doc);
  const content = getCleanText(mainContent);

  // Require minimum content length
  if (!content || content.length < 100) {
    return null;
  }

  return {
    content,
    title,
  };
}

export async function fetchAndExtractContent(
  url: string
): Promise<ExtractedContent | null> {
  const response = await fetch(url, {
    headers: {
      Accept: "text/html",
      "User-Agent": "Mozilla/5.0 (compatible; CloudstashBot/1.0)",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status}`);
  }

  const html = await response.text();
  return extractContent(html, url);
}
