import { decodeHtmlEntities } from "../metadata/decode-entities";

export interface ExtractedContent {
  title: string | null;
  content: string; // markdown content
  author: string | null;
  published: string | null;
  wordCount: number;
}

export async function extractContent(
  html: string,
  url: string
): Promise<ExtractedContent | null> {
  // Dynamic imports: defuddle/node and linkedom have module-load side effects
  // that touch the (incomplete) Worker `document` polyfill. Importing them
  // lazily keeps them out of any SSR/cold-start path that doesn't actually
  // need link extraction.
  const [{ Defuddle }, { parseHTML }] = await Promise.all([
    import("defuddle/node"),
    import("linkedom"),
  ]);

  const { document } = parseHTML(html);
  const result = await Defuddle(document, url, {
    markdown: true,
    removeImages: true,
    useAsync: false,
  });

  if (!result.content || result.wordCount < 20) {
    return null;
  }

  return {
    content: result.content,
    title: result.title ? decodeHtmlEntities(result.title) : null,
    author: result.author || null,
    published: result.published || null,
    wordCount: result.wordCount,
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
