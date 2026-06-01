# Notes on links

User-authored free-text notes on a link, sitting alongside the AI summary. The note is
respected by agent tools on retrieval, and the agent can write notes itself. Mirrors the
AI-summary pattern, but user-edited (not machine-generated) and editable.

Status: planned. Decisions locked; no code written yet.

## Locked decisions

- **Storage:** separate `link_notes` table (the JOIN is fine), one editable note per link.
- **Format:** markdown string. Editor is capped to bold/italic, so the markdown stays clean
  — agent writes and search LIKE-matching both see readable text, and the existing
  `<Markdown>` component renders it.
- **Event:** a single synced event, committed **on input blur** (not per keystroke).
- **Placement:** between title+description and the AI summary in the detail view.
- **Editor:** minimal Lexical — no static toolbar, a selection-triggered floating popup,
  **bold/italic only** (+ ⌘B/⌘I hotkeys). No headings, lists, or images.
- **Agent search ranking:** unchanged. Notes are returned on retrieval but do not alter
  `searchLinks$` scoring.

## Storage — `src/livestore/schema.ts`

New table, PK = `linkId` (enforces one note per link, makes upsert trivial):

```ts
linkNotes: State.SQLite.table({
  name: "link_notes",
  columns: {
    linkId: State.SQLite.text({ primaryKey: true }),
    note: State.SQLite.text({ default: "" }),   // markdown
    updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
  },
}),
```

## Event

Lean — one synced event carries set/clear (empty `note` = cleared):

```ts
linkNoteSet: Events.synced({
  name: "v1.LinkNoteSet",
  schema: Schema.Struct({ linkId: Schema.String, note: Schema.String, updatedAt: Schema.Date }),
}),
```

Materializer: empty `note` → delete the row; else upsert on `linkId`
(`onConflict("linkId", "replace")`). Confirm exact API against existing materializers
(`v1.LinkSummarized`, `v1.LinkCompleted`) before writing.

## Queries — `src/livestore/queries/links.ts` + `schemas.ts`

- Add `LEFT JOIN link_notes n ON n.linkId = l.id` to the detail query (simpler than the
  summary's correlated subquery — keyed directly by `linkId`).
- Select `n.note AS note`; add `note: Schema.NullOr(Schema.String)` to
  `LinkWithDetailsSchema`.
- For agent retrieval, also surface `note` on the search-results path
  (`searchResultsSchema`) — **without** changing scoring.

## UI — new `DetailNote`, detail-view

Insert between the title+description block and the AI-summary block in
`src/components/right-pane/detail-view/detail-view.tsx` (the gap after the title/description,
before `<DetailSummary>`).

- **Empty state:** full-width ghost `+ Add note` button (label TBD). Click expands the editor.
- **With a note:** same `flex flex-col gap-1.5` wrapper + `SectionEyebrow` ("Notes") + content
  area, mirroring `DetailSummary` (`ai-summary.tsx`) so it reads as a sibling sitting just
  above the AI summary.
- **Editor:** minimal Lexical (first one in the app — packages installed but unused at
  `lexical`/`@lexical/react`/`@lexical/list`/`@lexical/markdown` @ 0.42.0). No static
  toolbar; a floating toolbar popup appears on text selection. Formatting restricted to
  bold/italic, also via ⌘B/⌘I. RichTextPlugin with a locked-down node set (no heading/list/
  image nodes). Serialize to/from markdown via `@lexical/markdown`. Commit `linkNoteSet`
  on blur.

## Agent — `src/cf-worker/chat-agent/tools.ts`

- **Retrieval:** add `note` to the fields returned by `listRecentLinks` (currently
  `id/url/title/description`) and `searchLinks`.
- **New write tool `addNote`** (mirror `saveLink`): zod schema `{ linkId, note }`, resolve the
  store, validate the link exists, `store.commit(events.linkNoteSet({ linkId, note,
updatedAt: new Date() }))`, re-query to handle races, return success/failure. Agent writes
  markdown directly.

## Surface area

1 table + 1 event + 1 materializer, 2 query/schema edits, 1 `DetailNote` component + 1 minimal
Lexical editor, 2 tool tweaks + 1 new agent tool. No migration tooling (Livestore
self-materializes its SQLite).

## References

- AI-summary pattern (closest analog): `src/livestore/schema.ts` (`linkSummaries` table,
  `v1.LinkSummarized` event + materializer), `src/components/right-pane/detail-view/ai-summary.tsx`
- Detail view layout: `src/components/right-pane/detail-view/detail-view.tsx`
- Search query: `src/livestore/queries/links.ts` (`searchLinks$`), schemas in
  `src/livestore/queries/schemas.ts`
- Agent tools / write-tool pattern: `src/cf-worker/chat-agent/tools.ts` (`saveLink`)
