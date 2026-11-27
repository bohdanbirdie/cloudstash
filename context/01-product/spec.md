# Product — Spec

This document specifies the current product experience. It builds on
[requirements.md](./requirements.md).

## Status

Active.

## Product Loop

```text
capture → visible link → metadata/enrichment → skim → search/tag → read/archive
```

The primary authenticated surface is a compact link inbox with Inbox,
Completed, All, and Archive views. A right pane shows selected-link detail,
summary, tags, and contextual actions. A bottom dock provides search and the
workspace agent. Desktop keyboard interaction and mobile sheets expose the same
underlying library operations.

## Capture Surfaces

| Surface          | Current behavior                                                | Default plan availability |
| ---------------- | --------------------------------------------------------------- | ------------------------- |
| Web app          | Paste/type an HTTP(S) URL; commit locally                       | Free                      |
| Chrome extension | Pair from web, save active tab, sync recent links               | Free                      |
| Telegram         | Connect bot, send/forward URLs, receive progress and result     | Plus                      |
| Raycast          | Browser handoff mints a paired key; save from macOS             | Plus                      |
| Public API       | Bearer key; `POST /api/ingest` and `GET /api/links`             | Plus                      |
| X bookmarks      | Poll new bookmarks from connect-time onward                     | Pro                       |
| Chat agent       | Save, search, inspect, complete, restore, and archive via tools | Pro                       |

Every capture reaches the same workspace content model. Browser and extension
clients commit through LiveStore; external request sources enqueue ingestion;
chat calls the workspace `LinkProcessorDO`, which commits through the existing
canonical server-side LiveStore client.

## Link Experience

A link has independent dimensions:

- reading status: unread or completed;
- archival state: active or archived via `deletedAt`;
- processing status: absent/pending/reprocess-requested/completed/failed/cancelled;
- zero or more metadata snapshots and summaries, with the newest displayed;
- explicit tags and pending AI tag suggestions.

Archiving a link is reversible. Account deletion is a separate irreversible
lifecycle.
Duplicate URL saves within one workspace resolve to the existing link rather
than creating parallel visible entries.

## Search and Organization

Search executes against local SQLite and requires every query word to match at
least one of title, effective tag, domain, description, summary, or URL. Results
are relevance-ranked. Filters can require all selected effective tags. Pending
AI tag suggestions act as effective tags while remaining visibly distinguishable
from explicit tags.

## Colour and Depth

The interface is grey. Colour is rare and always means something. Rationale:
[decision 0002](./.decisions/0002-use-greys-with-one-blue-accent.md). The logo
follows [decision 0003](./.decisions/0003-use-a-ball-of-dots-in-a-well-as-logo.md).

**Grey**

- Surfaces, text, lines, icons, and every button that is not the main action
  are grey.
- Greys are pure: chroma 0, no warm or cool tint.

**The accent**

- There is one accent, the Blue `oklch(0.545 0.19 254)`, with a near-white
  label `oklch(0.99 0 0)`. It is the same in the dark and light themes.
- It marks the one main action in a view. A view has at most one accent-filled
  button.
- It also marks "on" and "you are here": switches, checkboxes, focus, and
  selection.
- It is never used for titles, links in running interface text, or decoration.
  One colour has one meaning.

**Other colour**

- Red is only for destructive actions and errors.
- Green and amber appear only for a real status, with an icon and words. The
  text stays grey.
- Space colours and saved links' pictures are the user's content and stay
  colourful. A Space colour is a rounded square, and every Space hue has the
  same lightness.
- The logo is drawn in the foreground grey, never in the accent.

**Depth**

- A colour-filled button carries a top-to-bottom gradient that is barely
  visible, blended in OKLab.
- A ring around a card, field, or button is 1px and see-through (white or black
  with opacity), never a solid grey line.

**Where the values live**

- Mac app: `palette(dark)` and `space(dark, hue)` in
  [`apps/native/src/theme.rs`](../../apps/native/src/theme.rs).
- Web app: the `:root` and `.dark` tokens in
  [`src/styles.css`](../../src/styles.css).

New colours are added to those two files as named tokens, not written inline
where they are used. Known drift is tracked in
[DELTA-043](../.delta/DELTA-043-button-depth-and-web-colour-tokens-are-not-realized.md).
Surface layering, shadows, and the future of the light theme are unsettled:
see [CS-DQ6](../open-questions.md).

## Keyboard Navigation (Mac app)

Every control in the Mac app can be reached and used from the keyboard, the way
a web page works in a browser, whatever the macOS "Keyboard navigation" setting
says. Rationale:
[decision 0004](./.decisions/0004-mac-app-keyboard-navigation-follows-aria-patterns.md).

- Tab and Shift+Tab move between components in reading order: the sidebar's
  Search, its Library list, its Spaces list and the account, then the link
  grid, then the toolbar's controls.
- Inside a component the arrow keys move: the sidebar lists and menus on ↑ ↓,
  the link grid by card and by row (Home and End go to the ends), the Display
  layouts on ← →. Moving never chooses; Enter or Space does.
- An arrow key with nothing focused, or on the closed Display button, moves
  focus to the first card in view. A focused text field keeps its arrows.
- A dialog, menu or panel keeps focus inside it while open; Esc closes it and
  focus returns to where it was. Closing a link's preview returns focus to that
  link's card.
- The command palette keeps focus in its field; ↑ ↓ move the highlighted
  result.
- The focus ring shows only for keyboard use: 2 points wide, 2 points outside
  the control, in the accent (`focus` in `theme.rs`, at least 3:1 against
  every surface it sits on). It is the one ring that is not a see-through
  hairline.

## Plans

[`src/lib/plan.ts`](../../src/lib/plan.ts) owns executable plan copy and default
capability values. Current bundles are:

- **Free:** up to 100 active links and 10 AI summaries each month, with Chrome
  capture, tags, archiving, search, sync, and export.
- **Plus:** up to 500 active links, 500 AI summaries, and 1,000 public API calls
  each month, plus Telegram, Raycast, and weekly digest.
- **Pro:** product-unlimited active links, 1,000 AI summaries, 1,000 Assistant
  credits, 10,000 combined API/MCP calls, 200 X imports, and 100 enriched X
  summaries each month.

“Weekly digest of what you read” is accepted marketing shorthand for a digest
selected from recently saved links. A generally larger Pro summary model is
planned work, not a current capability.

Monthly and annual paid intervals are supported. Marketing bullets are not an
authorization source; the server merges tier defaults with per-workspace
overrides at request/operation time.

## Trust Surfaces

The product publishes privacy, terms, contact, export, and account-deletion
surfaces. Link content is fetched to derive metadata and summaries; full fetched
pages are not retained in the workspace model. Basic link summaries use Workers
AI. Chat, eligible X enrichment, and weekly digest generation use
OpenRouter-hosted models. Public copy describes these providers and the
asynchronous deletion lifecycle without exposing internal model or workflow
details. Remaining retention and telemetry gaps are tracked in
[DELTA-013](../.delta/DELTA-013-activity-analytics-retain-content-after-deletion.md)
and [DELTA-016](../.delta/DELTA-016-telemetry-emits-raw-content-and-identifiers.md).

OneDollarStats runs across public and authenticated routes. Meta Pixel runs only
on the landing, login, contact, Terms, and Privacy routes, and its loader exits
before contacting Meta when the browser exposes Global Privacy Control.
