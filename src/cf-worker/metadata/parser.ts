/// <reference types="@cloudflare/workers-types" />
import { Match, Option, Schema } from "effect";

import { decodeHtmlEntities } from "./decode-entities";
import { parseJsonLd } from "./jsonld";
import { ResolvedUrl } from "./schema";

export interface MetadataResult {
  title?: string;
  description?: string;
  image?: string;
  favicon?: string;
}

export class MetadataParser implements HTMLRewriterElementContentHandlers {
  title: string | undefined;
  description: string | undefined;
  image: string | undefined;
  favicon: string | undefined;

  private resolveUrl: (url: string) => string;
  private titleText = "";
  private inTitle = false;

  private inJsonLd = false;
  private jsonLdRaw = "";
  private jsonLdTitle: string | undefined;
  private jsonLdDescription: string | undefined;
  private jsonLdImage: string | undefined;

  constructor(baseUrl: string) {
    const urlSchema = ResolvedUrl(baseUrl);
    this.resolveUrl = (url: string) => Schema.decodeUnknownSync(urlSchema)(url);
  }

  getResult(): MetadataResult {
    return {
      title: this.jsonLdTitle ?? this.title,
      description: this.jsonLdDescription ?? this.description,
      image: this.jsonLdImage ?? this.image,
      favicon: this.favicon,
    };
  }

  element(element: Element) {
    const tagName = element.tagName.toLowerCase();

    if (tagName === "title") {
      this.inTitle = true;
      return;
    }

    if (tagName === "script") {
      const type = element.getAttribute("type");
      if (type === "application/ld+json") {
        this.inJsonLd = true;
        this.jsonLdRaw = "";
      }
      return;
    }

    if (tagName === "meta") {
      const property =
        element.getAttribute("property") || element.getAttribute("name");
      const content = element.getAttribute("content");

      if (!content) {
        return;
      }

      const field = Match.value(property).pipe(
        Match.whenOr("og:title", "twitter:title", () => "title" as const),
        Match.whenOr(
          "og:description",
          "twitter:description",
          "description",
          () => "description" as const
        ),
        Match.whenOr("og:image", "twitter:image", () => "image" as const),
        Match.option
      );

      if (Option.isNone(field) || this[field.value]) return;

      const decoded = decodeHtmlEntities(content);
      this[field.value] =
        field.value === "image" ? this.resolveUrl(decoded) : decoded;
    }

    if (tagName === "link") {
      const rel = element.getAttribute("rel");
      const href = element.getAttribute("href");

      if (
        href &&
        (rel === "icon" ||
          rel === "shortcut icon" ||
          rel === "apple-touch-icon")
      ) {
        if (!this.favicon) {
          this.favicon = this.resolveUrl(decodeHtmlEntities(href));
        }
      }
    }
  }

  text(text: Text) {
    if (this.inTitle) {
      this.titleText += text.text;
      if (text.lastInTextNode) {
        this.inTitle = false;
        if (!this.title && this.titleText.trim()) {
          this.title = decodeHtmlEntities(this.titleText.trim());
        }
      }
    }

    if (this.inJsonLd) {
      this.jsonLdRaw += text.text;
      if (text.lastInTextNode) {
        this.inJsonLd = false;
        const parsed = parseJsonLd(this.jsonLdRaw);
        this.jsonLdRaw = "";
        if (!this.jsonLdTitle && parsed.title) {
          this.jsonLdTitle = decodeHtmlEntities(parsed.title);
        }
        if (!this.jsonLdDescription && parsed.description) {
          this.jsonLdDescription = decodeHtmlEntities(parsed.description);
        }
        if (!this.jsonLdImage && parsed.image) {
          // JSON-LD lives inside <script>, which HTML5 spec leaves as raw text
          // (entities are NOT decoded). Image URLs therefore arrive with literal
          // `&amp;` etc. and must be decoded before use.
          this.jsonLdImage = this.resolveUrl(decodeHtmlEntities(parsed.image));
        }
      }
    }
  }
}
