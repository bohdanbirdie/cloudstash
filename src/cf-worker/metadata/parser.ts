/// <reference types="@cloudflare/workers-types" />
import { Match, Schema } from 'effect'

import { ResolvedUrl } from './schema'

export class MetadataParser implements HTMLRewriterElementContentHandlers {
  title: string | undefined
  description: string | undefined
  image: string | undefined
  favicon: string | undefined
  ogUrl: string | undefined

  private resolveUrl: (url: string) => string
  private titleText = ''
  private inTitle = false

  constructor(baseUrl: string) {
    const urlSchema = ResolvedUrl(baseUrl)
    this.resolveUrl = (url: string) => Schema.decodeUnknownSync(urlSchema)(url)
  }

  element(element: Element) {
    const tagName = element.tagName.toLowerCase()

    if (tagName === 'title') {
      this.inTitle = true
      return
    }

    if (tagName === 'meta') {
      const property = element.getAttribute('property') || element.getAttribute('name')
      const content = element.getAttribute('content')

      if (!content) return

      const isTitle = (p: string | null) => p === 'og:title' || p === 'twitter:title'
      const isDescription = (p: string | null) =>
        p === 'og:description' || p === 'twitter:description' || p === 'description'
      const isImage = (p: string | null) => p === 'og:image' || p === 'twitter:image'

      Match.value(property).pipe(
        Match.when(isTitle, () => {
          if (!this.title) this.title = content
        }),
        Match.when(isDescription, () => {
          if (!this.description) this.description = content
        }),
        Match.when(isImage, () => {
          if (!this.image) this.image = this.resolveUrl(content)
        }),
        Match.when('og:url', () => {
          if (!this.ogUrl) this.ogUrl = content
        }),
        Match.orElse(() => {}),
      )
    }

    if (tagName === 'link') {
      const rel = element.getAttribute('rel')
      const href = element.getAttribute('href')

      if (href && (rel === 'icon' || rel === 'shortcut icon' || rel === 'apple-touch-icon')) {
        if (!this.favicon) {
          this.favicon = this.resolveUrl(href)
        }
      }
    }
  }

  text(text: Text) {
    if (this.inTitle) {
      this.titleText += text.text
      if (text.lastInTextNode) {
        this.inTitle = false
        if (!this.title && this.titleText.trim()) {
          this.title = this.titleText.trim()
        }
      }
    }
  }
}
