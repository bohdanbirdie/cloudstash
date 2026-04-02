import { Defuddle } from "defuddle/node";

export interface ExtractedContent {
  title: string | null;
  content: string; // markdown content
  author: string | null;
  published: string | null;
  wordCount: number;
}

export function extractContent(
  html: string,
  url: string
): Promise<ExtractedContent | null> {
  return Defuddle(html, url, {
    markdown: true,
    removeImages: true,
    useAsync: false,
  }).then((result) => {
    if (!result.content || result.wordCount < 20) {
      return null;
    }

    return {
      content: result.content,
      title: result.title || null,
      author: result.author || null,
      published: result.published || null,
      wordCount: result.wordCount,
    };
  });
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
