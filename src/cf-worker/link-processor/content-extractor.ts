import { parseHttpUrl } from "../../lib/http-url";
import { decodeHtmlEntities } from "../metadata/decode-entities";
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

async function readBodyCapped(
  response: Response,
  maxBytes: number
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ContentExtractorFailure(
        "body-too-large",
        `Response body exceeded ${maxBytes} bytes`
      );
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

// Re-validates scheme on each hop because Workers' default redirect:'follow'
// would otherwise chase up to ~20 hops to anything (including `javascript:`).
async function fetchHtmlWithRedirects(
  startUrl: string,
  signal: AbortSignal
): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!parseHttpUrl(current)) {
      throw new ContentExtractorFailure(
        "scheme-rejected",
        `Disallowed URL scheme at hop ${hop}: ${current}`
      );
    }
    const response = await fetch(current, {
      headers: FETCH_HEADERS,
      redirect: "manual",
      signal,
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return response;
      current = new URL(location, current).href;
      continue;
    }
    return response;
  }
  throw new ContentExtractorFailure(
    "too-many-redirects",
    `Too many redirects (>${MAX_REDIRECTS})`
  );
}

export async function fetchAndExtractContent(
  url: string
): Promise<ExtractedContent | null> {
  if (!parseHttpUrl(url)) {
    throw new ContentExtractorFailure(
      "scheme-rejected",
      `Disallowed URL scheme: ${url}`
    );
  }
  // The outer Effect.timeout can't cancel an in-flight fetch (JS Promises
  // aren't cancellable) — wire AbortSignal so the body read actually stops.
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await fetchHtmlWithRedirects(url, signal);

  if (!response.ok) {
    throw new ContentExtractorFailure(
      "upstream-http-error",
      `Failed to fetch URL: ${response.status}`
    );
  }

  const html = await readBodyCapped(response, MAX_RESPONSE_BYTES);
  return extractContent(html, url);
}
