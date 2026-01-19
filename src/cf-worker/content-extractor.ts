import { parseDocument } from 'htmlparser2'
import { textContent, getElementsByTagName, removeElement, getAttributeValue } from 'domutils'
import type { Document, Element } from 'domhandler'

export interface ExtractedContent {
  title: string | null
  content: string // plain text content
}

// Tags to remove entirely (noise)
const REMOVE_TAGS = [
  'script',
  'style',
  'nav',
  'footer',
  'aside',
  'iframe',
  'noscript',
  'header',
  'form',
  'button',
]

/**
 * Cleans up whitespace in text.
 */
function cleanText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/**
 * Gets clean text content from an element.
 */
function getCleanText(element: Element | Document): string {
  return cleanText(textContent(element))
}

/**
 * Finds the best content container in the document.
 */
function findMainContent(doc: Document): Element | Document {
  // Try semantic content tags first
  for (const tag of ['article', 'main']) {
    const elements = getElementsByTagName(tag, doc, true)
    if (elements.length > 0) {
      // Return the largest one by text content
      let best = elements[0]
      let bestLength = getCleanText(best).length
      for (const el of elements) {
        const len = getCleanText(el).length
        if (len > bestLength) {
          best = el
          bestLength = len
        }
      }
      return best
    }
  }

  // Try role="main"
  const allElements = getElementsByTagName('*', doc, true)
  for (const el of allElements) {
    if (getAttributeValue(el, 'role') === 'main') {
      return el
    }
  }

  // Fall back to body
  const body = getElementsByTagName('body', doc, true)
  if (body.length > 0) {
    return body[0]
  }

  return doc
}

/**
 * Extracts the page title.
 */
function extractTitle(doc: Document): string | null {
  // Try <title> tag
  const titleElements = getElementsByTagName('title', doc, true)
  if (titleElements.length > 0) {
    const text = getCleanText(titleElements[0])
    if (text) return text
  }

  // Try <h1>
  const h1Elements = getElementsByTagName('h1', doc, true)
  if (h1Elements.length > 0) {
    const text = getCleanText(h1Elements[0])
    if (text) return text
  }

  // Try og:title meta tag
  const metaTags = getElementsByTagName('meta', doc, true)
  for (const meta of metaTags) {
    const property = getAttributeValue(meta, 'property') || getAttributeValue(meta, 'name')
    if (property === 'og:title' || property === 'twitter:title') {
      const content = getAttributeValue(meta, 'content')
      if (content) return content
    }
  }

  return null
}

/**
 * Removes unwanted elements from the document.
 */
function removeNoiseElements(doc: Document): void {
  for (const tag of REMOVE_TAGS) {
    const elements = getElementsByTagName(tag, doc, true)
    for (const el of elements) {
      removeElement(el)
    }
  }
}

/**
 * Extracts the main content from HTML as plain text.
 * Uses htmlparser2 (pure ESM, Workers-compatible) for parsing.
 */
export function extractContent(html: string, _url: string): ExtractedContent | null {
  try {
    const doc = parseDocument(html)

    // Extract title before removing elements
    const title = extractTitle(doc)

    // Remove noise elements
    removeNoiseElements(doc)

    // Find main content
    const mainContent = findMainContent(doc)
    const content = getCleanText(mainContent)

    // Require minimum content length
    if (!content || content.length < 100) {
      return null
    }

    return {
      title,
      content,
    }
  } catch (error) {
    console.error(`Failed to extract content:`, error)
    return null
  }
}

/**
 * Fetches a URL and extracts its content.
 */
export async function fetchAndExtractContent(url: string): Promise<ExtractedContent | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkBucketBot/1.0)',
        Accept: 'text/html',
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
