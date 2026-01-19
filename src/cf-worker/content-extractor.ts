import { parseHTML } from "linkedom"
import { Readability } from "@mozilla/readability"
import TurndownService from "turndown"

export interface ExtractedContent {
  title: string | null
  content: string // markdown content
  textContent: string // plain text
  excerpt: string | null
  byline: string | null
  siteName: string | null
}

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
})

// Remove script, style, nav, footer, aside elements
turndownService.remove([
  "script",
  "style",
  "nav",
  "footer",
  "aside",
  "iframe",
  "noscript",
])

/**
 * Extracts the main article content from HTML and converts it to markdown.
 * Uses Mozilla's Readability (Firefox Reader Mode algorithm) + Turndown.
 */
export function extractContent(
  html: string,
  url: string,
): ExtractedContent | null {
  try {
    // Parse HTML with linkedom
    const { document } = parseHTML(html)

    // Use Readability to extract main article content
    const reader = new Readability(document as unknown as Document, {
      charThreshold: 100,
    })

    const article = reader.parse()

    if (!article || !article.content) {
      return null
    }

    // Convert HTML content to markdown
    const markdown = turndownService.turndown(article.content)

    return {
      title: article.title || null,
      content: markdown,
      textContent: article.textContent || "",
      excerpt: article.excerpt || null,
      byline: article.byline || null,
      siteName: article.siteName || null,
    }
  } catch (error) {
    console.error(`Failed to extract content from ${url}:`, error)
    return null
  }
}

/**
 * Fetches a URL and extracts its content as markdown.
 */
export async function fetchAndExtractContent(
  url: string,
): Promise<ExtractedContent | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; LinkBucketBot/1.0)",
        Accept: "text/html",
      },
    })

    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`)
      return null
    }

    const html = await response.text()
    return extractContent(html, url)
  } catch (error) {
    console.error(`Failed to fetch and extract content from ${url}:`, error)
    return null
  }
}
