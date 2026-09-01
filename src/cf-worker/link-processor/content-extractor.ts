import { Schema } from "effect";

import { decodeHtmlEntities } from "../metadata/decode-entities";
import {
  BoundedFetchFailure,
  fetchBoundedText,
  HttpTargetUrl,
} from "../net/bounded-fetch";
import { ContentExtractorFailure } from "./errors";

export interface ExtractedContent {
  title: string | null;
  content: string; // markdown content
  author: string | null;
  published: string | null;
  wordCount: number;
}

const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 15_000;
const FETCH_HEADERS = {
  Accept: "text/html",
  "User-Agent": "Mozilla/5.0 (compatible; CloudstashBot/1.0)",
};

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
  url: string,
  fetcher: typeof fetch = fetch,
  ownHostname?: string,
  signal: AbortSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
): Promise<ExtractedContent | null> {
  const targetSchema = HttpTargetUrl(ownHostname);
  let target: URL;
  try {
    target = await Schema.decodeUnknownPromise(targetSchema)(url);
  } catch (cause) {
    throw new ContentExtractorFailure("scheme-rejected", String(cause));
  }

  let response: Awaited<ReturnType<typeof fetchBoundedText>>;
  try {
    response = await fetchBoundedText({
      acceptedContentTypes: ["text/html", "application/xhtml+xml"],
      fetcher,
      headers: FETCH_HEADERS,
      maxBytes: MAX_RESPONSE_BYTES,
      maxRedirects: MAX_REDIRECTS,
      signal,
      targetSchema,
      url: target,
    });
  } catch (cause) {
    if (cause instanceof BoundedFetchFailure) {
      throw new ContentExtractorFailure(
        cause.reason === "target-rejected" ? "scheme-rejected" : cause.reason,
        cause.message
      );
    }
    throw cause;
  }
  return extractContent(response.body, response.finalUrl.href);
}
