# Metadata Extraction

How a saved link gets its title, description, image, and favicon. Sits between [[link-processor]]'s `MetadataFetcher` step and the `linkSnapshots` event.

## Goals

- **Clean titles for popular sites.** GitHub repos as `org/repo`, tweets as `Author: <preview>`, YouTube videos by their actual title — not `"Page Name | Site Name"` or `"GitHub - org/repo: ..."`.
- **One pipeline.** Browser, Queue (API/Telegram/Raycast), and reprocess paths all converge on the same extractor.
- **Fail soft.** Extractor failures, malformed responses, login walls, network blips — none should overwrite a previously good snapshot.

## Pipeline

```
fetchOgMetadata(targetUrl)
  │
  ├─ tryExtract(url)            (per-host fast path)
  │   ├─ matched + authoritative → return result; skip HTML fetch
  │   └─ matched + non-authoritative → keep result; continue to merge
  │
  ├─ fetch(url)                 (HTML fetch + HTMLRewriter)
  │   └─ MetadataParser walks <title>, <meta og:*>, <meta twitter:*>,
  │      <link rel=icon>, <script type=application/ld+json>
  │
  └─ merge: extractor wins on populated fields; OG fills the gaps
```

`MetadataFetcher` wraps this with timeout + retry.

## Field priority

Per-host extractor → JSON-LD → OG/Twitter → `<title>` (title only) → URL fallback (consumer-side).

JSON-LD outranks OG because:

- News sites publish typed `Article`/`NewsArticle`/`VideoObject` blocks with a `headline` that's cleaner than `<title>`.
- Sites that gate OG behind a login wall often still ship JSON-LD.

The HTML parser tracks JSON-LD and OG/Twitter values in separate slots and merges them at the end — the parser cannot tell up front whether OG or JSON-LD will appear first in the document.

## Per-host extractors

Each extractor is `{ name, authoritative, extract(url) }`. **Authoritative** means the per-host result is canonical and the HTML fetch is skipped. Non-authoritative means we still fetch HTML and let OG fill any gaps the extractor left blank.

| Host                      | Strategy                                                                                                                                                       | Authoritative?                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `github.com`              | Parse `org/repo` (or `org/repo#NN`) from the URL path                                                                                                          | No — OG fills description and the auto-generated repo card image |
| `x.com`, `twitter.com`    | Undocumented `cdn.syndication.twimg.com/tweet-result` endpoint; compose title as `Author: <first sentence/paragraph>`, full body in description when truncated | Yes — x.com OG returns a generic "Author on X"                   |
| `youtube.com`, `youtu.be` | YouTube `/oembed`; only invoked for `/watch`, `/shorts`, `/playlist`, `/embed`, and `youtu.be` shortlinks                                                      | Yes                                                              |

Two implementation constraints worth knowing:

- The X syndication endpoint requires browser-shaped headers (UA, `Accept-Language`, `Referer: https://platform.twitter.com/`); Cloudflare's default fetch headers get 400'd.
- The X syndication token formula `((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "")` is locked in by fixture tests — `Number` precision drift would silently 400 every tweet.

## Limits / non-goals

- **No client-side extraction.** Extractors are worker-only — CORS makes browser-side fetch useless against arbitrary URLs. The browser hits `/api/metadata` and the worker does the work.
- **No SaaS fallback** (Microlink, Cloudflare Browser Rendering, etc.). When OG and per-host extractors both fail, the link saves with a URL-only snapshot. Ship more per-host extractors before reaching for browser rendering.
- **No worker-side cache.** `/api/metadata` sets `Cache-Control: public, max-age=86400` for browser-level reuse. Cross-user / cross-path dedup via Cache API was considered and rejected — the realistic workload is one user adding one link, so the saved fetch (per link) doesn't justify the code.
- **No login-wall detection.** Sites like Instagram occasionally serve generic "Create an account" pages instead of real metadata to server-side fetchers. We accept the occasional weird snapshot; the user can reprocess. Detecting these via copy-matching regex was tried and removed (fragile to copy changes).
