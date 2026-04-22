# App Redesign

Working doc for the redesign effort. Captures direction, reference prototype, phased implementation plan, and open questions. Iterates locally; lands as incremental PRs as phases firm up.

## Reference prototype

**`local/redesign-prototypes/1-masthead-v3c-home2.html`** — adopted as the feature and interaction reference. It captures the agreed layout architecture, chrome-less right-pane state machine (home / detail / selection), animation direction (blur-slide-in on link selection), and command-chip interaction model.

**How to use the prototype:**

- Treat it as a _feature reference_, not a pixel-perfect target. Spacing, colors, and type will refine in the real implementation.
- The prototype is gitignored. Open via `open local/redesign-prototypes/1-masthead-v3c-home2.html`.
- When the real app implementation diverges from the prototype, **prefer respecting existing app features over matching the prototype**. The prototype omits many features the app already has (see "Features to respect" below) — those must carry forward even if they weren't visible in the prototype.

## Direction

See [[../../.impeccable.md|Design Context]] (at repo root) for the authored design context — personality, theme, typography, principles.

Short version: **precise, light, premium.** Light-mode first. Warm orange accent, used rarely. JetBrains Mono as typographic identity. Must not read as default shadcn.

## Current status

_Quick at-a-glance status for resuming work. Detailed history lives in the Progress log at the bottom._

- **Phase 1 — Outer shell**: ✅ shipped (2026-04-22). Sidebar gone; `TopBar` + `Masthead` + `DotsMenu` + `PageShell` in place across `/`, `/all`, `/completed`, `/trash`. Admin/brand keep their own chrome (opt-in via not wrapping in `PageShell`). Modal preview still intact. `_authed.tsx` is neutral (providers + outlet).
- **Phase 2 — List + right-pane default**: 🟡 partial. Perf strategy landed early (see below); list row anatomy NOT yet redone; right-pane home view NOT yet added; grid view treatment NOT addressed.
- **Phase 2 perf (applied ahead of schedule)**: ✅ lifted `tagsByLink$` + `processingStatusByLink$` queries, `React.memo` with custom comparator on `LinkCard` / `LinkListItem`, `data-id` stable callbacks, `formattedDate` passed from parent, `content-visibility: auto` + `contain-intrinsic-size`, lazy/async images. **Observed result: improved but not yet smooth at 250+ links.** Next step is in-app instrumentation (see "Performance instrumentation" in Phase 2 in-scope).
- **Phases 3–5**: not started.
- **Multi-select temporarily disabled** (2026-04-22 evening): selection store / hotkey tracking / modifier-click handling / `SelectionToolbar` all unwired. Card `selected` and `selectionMode` props removed. Reason: selection-mode hotkey was re-rendering all 244 cards on every Cmd keypress. To be rebuilt in Phase 3 as the right-pane selection view. Dead code preserved (`selection-store.ts`, `selection-toolbar.tsx`) for resurrection.
- **Perf architecture decision (2026-04-22 late evening)**: pursued and rejected both `<Activity>` keep-alive and CSS `display:none` pre-rendering. Normal TanStack Router mount/unmount per route restored. Approach: keep the queries fast via composite indexes + keep the shell mounted (global work stays mounted across category switches). Accept the per-route mount cost (~77ms for 244 cards) as bounded by React's reconciliation floor. Indexes added on `links(status, deletedAt, createdAt)`, `links(deletedAt, createdAt)`, `links(status, deletedAt, completedAt)`, `links(deletedAt)`.
- **Phase 1 cleanup pass** (2026-04-22 overnight): deleted `app-sidebar.tsx`, `ui/sidebar.tsx`, and the `link-card/` barrel. Various small polish — inconsistent naming fixed, redundant allocations dropped, inline styles eliminated. 534/534 tests still pass.
- **Perf floor understood** (2026-04-22 overnight, Chrome DevTools profiling): at 241 links, SQL is fast (14ms total via composite indexes), React scheduling + GC dominates (~110ms combined). IVM shelved — not where the cost lives. Detailed findings in Open Questions below.

## Implementation approach

Five phases, each a standalone chunk of work that can ship independently. Earlier phases are preparatory and reversible; later phases are where the redesigned experience actually lands.

**Guidance to the agent implementing each phase:**

The plan below is deliberately incomplete. Each phase lists specific decision points that were not discussed during design iteration. **Stop and ask the user rather than guess.** In the PR description for each phase, list (a) decisions you asked the user about and (b) small decisions you made without asking — this gives the user a chance to correct course.

Always read the current app's state of a feature before replacing it. The prototype is a direction, not a spec.

### Features to respect (must carry forward)

The prototype omits these features that the production app has today. The implementation must preserve them unless a phase explicitly replaces one:

- **Ingestion sources** beyond manual paste: Telegram bot, Raycast extension, iOS Shortcut, API, Chrome extension (planned). None of these UIs change.
- **Processing states** for in-flight links: pending, fetching, processing summary, error. Currently visualized via `BorderTrail` animation on the card.
- **Link actions**: mark complete / uncomplete, archive, restore from trash (within 30 days), delete, reprocess, copy URL, open external.
- **Tags**: filter by tag or untagged, manage tags (rename, merge, delete), AI-suggested tags on new links, per-link tag editor.
- **Multi-select**: modifier-click to toggle, shift-click for range, bulk actions (complete, archive, delete, export, tag).
- **Export**: selected-links export (format TBD in the new UI; currently exists in the floating toolbar).
- **Chat/agent**: conversation about the full archive or a specific link; uses Vercel AI SDK + OpenRouter.
- **Routes**: `/` (inbox), `/all`, `/completed`, `/trash`, plus admin-only `/admin` and `/brand`.
- **Auth**: Google OAuth via Better Auth; sign-out action.
- **Keyboard**: Cmd+V (add link), Cmd+K (search), Esc, modifier clicks, and any route-specific shortcuts.
- **Sync status**: existing UI indicating connection state and catch-up.
- **Admin panel**: usage stats, user management (admin-only, separate route).

---

## Phase 1 — Outer layout shell

**Goal:** replace the current sidebar-based shell with the new 1400px-frame + two-column header layout. Existing modal link preview stays intact. No activity grid yet.

### In scope

- Remove `src/components/app-sidebar.tsx` and `SidebarProvider` usage from `src/routes/_authed.tsx`.
- New shell in `_authed.tsx`:
  - Top utility row: wordmark (left) + sync indicator + add icon + "⋯" menu (right).
  - Masthead block left-aligned to the list-column width (820px).
  - Right slot of the header (above the future right pane): empty placeholder in phase 1.
  - Below masthead: a hairline rule spanning the full 1400px frame.
  - Below hairline: a grid `820px 540px` with 40px gap. Left cell = current links list/grid (unchanged in phase 1). Right cell = empty placeholder.
- Masthead content varies by route: page title (INBOX / ALL / COMPLETED / TRASH), meta line, inline category nav, inline tag strip (reuse existing tag filter behaviour).
- All per-route functionality intact. Clicking a link still opens the existing modal.
- All existing keyboard shortcuts still work.
- Sidebar items find new homes (see Decisions below).

### Out of scope

- Activity indicator in the right header slot (phase 5).
- Right-pane content (phase 2).
- Link detail in the right pane (phase 3); the modal stays in phase 1.
- Command chip (phase 4).
- Multi-select UI migration (phase 3).
- Color token / type scale pass (cross-cutting — tackle before phase 2 if it blocks).

### Decisions to ask about

- **Sidebar items' new homes.** Enumerate every item currently in `app-sidebar.tsx` and ask where each goes. Proposed default mapping (confirm each):
  - Logo → into the top-left wordmark.
  - Add Link action → top-right plus icon.
  - Search action → left intact as Cmd+K for now; becomes the chip in phase 4.
  - Inbox / Completed / All / Trash nav → inline text category nav in the masthead.
  - Sync status → top-right sync dot + text.
  - Admin link → "⋯" menu in top-right utility row (admin-only visibility).
  - Brand link → "⋯" menu (admin-only).
  - Agent → postponed to phase 4 chip; stub a link in the "⋯" menu that opens the existing chat sheet for now.
  - Tags manager → "⋯" menu for now; will move to the chip in phase 4.
  - Integrations → "⋯" menu (will be user-accessible via chip slash-commands later).
  - Sign out → "⋯" menu, last item.
- **Mobile layout.** The current app uses `useIsMobile` to adapt. Two paths:
  - (a) Phase 1 preserves the existing mobile sidebar drawer; new shell applies desktop-only.
  - (b) Phase 1 ships a mobile-first vertical stack for the new shell.
    Which?
- **Admin/brand routes.** Do they inherit the new layout or keep their own chrome?
- **Masthead meta line copy per route.** Inbox is straightforward ("X unread · last added Ym ago"). All, Completed, Trash each need meta-line copy — specify.
- **Category label wording.** Prototype uses `inbox · all · completed · trash`. Any renames (e.g. `all` → `archive`)?
- **"⋯" menu trigger.** Three-dots icon, a gear icon, or just the user's avatar with a dropdown?
- **Tag strip density at 820px.** The current app has many more tags than the prototype's six. Does the strip wrap to multiple lines, show the top N with "+more", or scroll horizontally?

### Success criteria

- Sidebar is gone from the `_authed` layout.
- All four main routes render with the new header + hairline + the existing list below.
- Clicking a link still opens the existing modal.
- All existing keyboard shortcuts still work.
- `bun run typecheck`, `bun run check`, `bun test` all pass.

---

## Phase 2 — Inner content: list + right-pane default view

**Goal:** replace the existing link card with the new row anatomy. Wire up the right pane's default (home) content. Link detail still opens in the existing modal; right pane is purely the default state in phase 2.

**Status (2026-04-22):** the rendering-performance subset landed ahead of schedule (see Progress log). Still outstanding: new row anatomy, right-pane home view, grid-view treatment, and **in-app perf instrumentation** (see below — moved up in priority because the perf pass left residual jank).

### In scope

- **Performance instrumentation (immediate next step)** — the perf refactor improved things but didn't eliminate feed-blocking jank at ~250 links. Before changing more code, add a lightweight in-app measurement so we can see what's hitting the main thread. Candidates: React `<Profiler>` around `LinkGrid`, a `PerformanceObserver` for `longtask` entries, a small FPS counter; surface as a dev-only floating HUD toggled via env flag or keyboard shortcut. Goal: identify whether residual jank is initial render, scroll paint, Livestore event fan-out, or something else.
- New `LinkRow` component matching prototype row anatomy:
  - Left: 48×48 thumbnail (or monogram tile for links without an image).
  - Title (weight 600, 16px), domain (weight 400, 12px, muted), description (weight 400, 13px, muted, 2-line clamp).
  - Bottom line: tag chips + ago (right-aligned, tabular).
  - `loading="lazy"` + `decoding="async"` on images.
- Time-grouping headers (`Today`, `Yesterday`, `This week`, `Older`) computed in the component from `createdAt`.
- **Apply the rendering performance strategy** (see "Rendering performance" below): lift queries, `React.memo`, stable callbacks, format dates in parent, `content-visibility: auto`, `contain-intrinsic-size`. Target: 500 items scrolling smoothly without virtualization.
- Right-pane default (home) content:
  - Section label `THIS WEEK'S DIGEST`.
  - Editorial paragraph summary (see decisions for source).
  - Meta line (`generated from N saves this week · updated X`).
  - Action row `✱ ask about this week · ⎋ dismiss`.
  - Keyboard hints footer row (`⌘K · ⌥N · Esc`).
- Both list and grid views still toggle-able via the existing `useViewModeStore`; grid treatment adjustments are a separate sub-task (see decisions).

### Out of scope

- Right-pane detail state (phase 3).
- Blur-slide animation (phase 3).
- Multi-select right-pane view (phase 3).
- Command chip (phase 4).
- Activity indicator (phase 5).

### Decisions to ask about

- **Livestore reference stability.** Run the empirical check (see "Rendering performance" section) and report back before writing any row code. This decides whether we need a custom memo comparator.
- **Weekly Digest source.** Options: (a) pre-generate server-side on a cron; (b) generate on-demand via AI SDK when the home renders; (c) stub placeholder text for now and build the backend in a follow-up. Which?
- **"Ask about this week" wiring.** Chip is phase 4. In phase 2, does this action stub to the existing chat sheet, or is it disabled until phase 4?
- **"Dismiss" action.** What does it do? Hide the digest until tomorrow? Forever? Until manually re-enabled?
- **Keyboard hints in the footer row.** The app has many shortcuts. Confirm that `⌘K search`, `⌥N add`, `Esc back` are the three worth promoting.
- **Right pane while the modal is open.** Does the home view stay visible behind/around the modal, or does the modal block it visually?
- **Grid view behaviour in the narrower list column.** In the new 820px list column, the current 4-col grid will feel stamped. Three options:
  - (a) Reduce grid to 2 columns at 820px width.
  - (b) Leave grid untouched; accept it'll look busier.
  - (c) Disable grid toggle in phase 2 and re-design it in phase 5.
- **Image-less card treatment.** Currently shows a full `aspect-video` placeholder with a lone `ImageIcon` — wasteful. Switch image-less rows to the monogram tile (first letter of domain)?
- **Time grouping boundaries.** Prototype uses Today / Yesterday / This week / Older. Confirm exact cutoffs (e.g., "This week" = last 7 days rolling? Current week? Up to last Sunday?).

### Success criteria

- List renders with new row anatomy across all four routes.
- 500 items scroll smoothly at 60fps — measure with DevTools Performance tab and report the P95.
- Livestore subscription count drops from N × 2 per list to constant (lifted queries).
- Home view visible in the right pane; modal still used for detail.
- Tag filter, multi-select modifier keys, processing animations all still work.

---

## Phase 3 — Active link state in the right pane + animations

**Goal:** remove the link detail modal. Detail lives in the right pane. Multi-select also lives in the right pane. Blur-slide-in animation on selection transitions.

### In scope

- Delete (or feature-flag off) `src/components/link-detail-dialog/*`.
- Right-pane state machine: `home` / `detail` / `selection`. Implemented as a single component that picks its view from global state.
- **Detail view** content:
  - Icon action cluster in top-right (see decisions for the exact set).
  - Hero image (or monogram), meta line (domain · ago · tags), title (weight 700, 28px), description, hairline, summary section with markdown.
- **Multi-select view** content:
  - Icon action cluster (✓ complete · ⎋ archive · `#` tag · ↓ export · × clear).
  - Big tabular count (weight 700, 40px).
  - Selected-title list capped at 3 with "+N more".
  - Modifier hints line (`⇧ click for range · ⌘ click to add/remove · Esc to clear`).
- **Active row marker**: small accent checkmark SVG (12×12) beside the title when the row is in the selection set. NOT a side-stripe.
- **Animations**:
  - Mode-change transition: 140ms exit (fade + `translateX(-12px)`), 80ms overlap, 280ms enter (`translateX(-40px → 0)` + `blur(6px → 0)` + opacity), `cubic-bezier(0.22, 1, 0.36, 1)`.
  - Reverse (detail → home): softer — 160ms exit, 200ms enter, no blur.
  - `prefers-reduced-motion`: fall back to 120ms opacity-only crossfade.
  - Use CSS transitions (interruptible), not keyframes. No `transition: all`.
- **Escape key priority**: chip (phase 4 — handle the hook even if the chip isn't built yet) → selection → detail → home.

### Out of scope

- Command chip (phase 4).
- Activity indicator (phase 5).

### Decisions to ask about

- **Map every feature from the current modal to the new detail view.** The modal has: full markdown summary, tag editor, reprocess, delete, prev/next arrows, status badges, processing animation, chat-about-this-link. Confirm each:
  - Full markdown summary: lives in the detail view's summary section.
  - Tag editor: the `#` icon opens a popover inline, or a dedicated tag editor area below the summary?
  - Reprocess: add a `⟳` icon to the cluster, or nest in a `⋯` menu?
  - Delete: separate icon, confirmation flow, or in a `⋯` menu?
  - Prev/next: keyboard only (`j`/`k` or arrow keys through the list), visible affordance in the detail header, or both?
  - Status badges (Trash, Completed, telegram/api/chat source): surfaced in the meta line?
  - Processing animation: wraps the whole right pane, or just the hero area, or just the title?
  - Chat-about-this-link: wire to phase 4 chip (agent mode with link pre-attached), stub for now, or keep the existing chat sheet as interim?
- **URL state for the selected link.** Current modal doesn't update the URL. Should opening a link update the URL to something like `/inbox?link=ID` (shareable, back-button friendly)?
- **Multi-select + single-select interaction.** When user Cmd-clicks a 4th row into a 3-item selection:
  - Already in selection mode → just update count and list (no mode transition).
  - When user regular-clicks a row while selection exists: clear selection and open detail, or keep selection and open detail on top?
  - When user presses Esc with selection AND detail both open: clear selection first and keep detail, or clear everything?
- **Export format(s).** The `↓` icon in multi-select: JSON / Markdown / CSV / all three via a popover?
- **Tag applier behaviour in multi-select.** Clicking `#` in selection view: adds a single tag to all? Removes? Opens a tag picker with add/remove toggles per tag?
- **Detail pane width.** Prototype uses 540px. Is that wide enough for markdown summaries with code blocks, or should it flex to `minmax(540px, 640px)`?
- **Within-mode updates.** Selection count changes during rapid Cmd-clicks — cross-fade count only (snappy) or re-run blur-slide (deliberate)? The prototype's rough edge was the lag here.
- **Mode transition on route change.** If the user is in detail view on `/inbox` and navigates to `/all`, does the right pane close, stay with the same link, or switch to the home view for the new route?

### Success criteria

- Old modal component is deleted (or off by default behind a flag).
- Clicking a row opens detail in the right pane with blur-slide; cross-fade to another detail on next click.
- Modifier-click opens multi-select view; clear with Esc or ×.
- All modal-era features have a documented new home (in the PR description if not obviously implemented).
- Animations respect `prefers-reduced-motion`.

---

## Phase 4 — Floating command chip

**Goal:** add the persistent bottom-anchored chip as the primary command surface. Three states (idle → search → agent). Replaces the existing Cmd+K search dialog and the chat sheet.

### In scope

- Chip positioned `position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%)` with the three states from the prototype.
- **Idle**: pill, "type a command or search… ⌘K" hint.
- **Search**: expands to a panel with live filter across links; up to 4 results; bottom row `✱ Ask Cloudstash about '<query>'`.
- **Agent**: user bubble, agent reply, follow-up input; multi-turn history in the session.
- Keyboard: ⌘K / Ctrl+K focuses the chip; Esc collapses; clicking outside collapses; clicking a result selects that link (closes chip, opens detail); Tab to switch between search and ask modes.
- Wire to existing AI SDK + OpenRouter plumbing.
- Remove the existing search dialog and chat sheet (the chip subsumes both).
- Prototype's rough edges must be fixed before landing — see polish decisions below.

### Out of scope

- Settings/integrations slash-commands (phase 5).

### Decisions to ask about

- **Search index scope.** Title / domain / description / tags is the minimum. Also include the full AI summary body? Performance implications — summaries are long.
- **Agent context window for queries.** Options for what the agent sees:
  - Only the current query (no link context).
  - The user's N most recent links.
  - Top-K keyword-matched links.
  - A combination (e.g., recent + top-K matched).
  - Full archive (won't fit context window).
    Specify the MVP context strategy.
- **Chat history persistence.** Across sessions, or scoped to the open tab? If persisted, stored in Livestore or separately?
- **Link-attached chat.** `✱ chat about this` from the detail view opens the chip in agent mode with the link pre-attached as context. How is the attached link indicated in the chip UI — a small chip at the top of the panel? Removable?
- **Tool calls.** If the agent can invoke tools (e.g. "tag links matching Y with X"), how are tool calls rendered in the chip? Same UI as the current chat sheet or simplified?
- **Streaming.** Confirm the chip renders streaming token-by-token (the current chat does).
- **Mobile treatment.** Chip at bottom-28 is desktop-sized. On mobile: expand to full width, stick to top as a header, or become a separate modal?
- **Polish items flagged during prototype iteration.** Specify the concrete polish list:
  - Transition feel between search → agent (currently abrupt).
  - Loading state while agent is thinking.
  - Keyboard arrow-key navigation through search results.
  - Empty-search state.
  - "Recent queries" or saved queries?
  - Visual indication of the current mode (search vs agent).
- **Removal of chat sheet UI.** Is this in scope for phase 4 or deferred to phase 5 to reduce churn?

### Success criteria

- Chip works end-to-end: type → search results → ask → streaming agent response.
- Existing Cmd+K dialog removed.
- Existing chat sheet removed or migrated.
- No regressions on ingestion paths (Cmd+V, Telegram, Raycast, etc.).
- Mobile layout has a defined chip behaviour.

---

## Phase 5 — Remaining small things

**Goal:** the tail of the redesign. Each item is self-contained — pick them up as sub-PRs.

### Candidate items

- **Activity indicator** in the right-side header slot (horizontal 7-day bar chart from the prototype). Requires a query aggregating daily link counts. Decide window (last 7d, last 30d, rolling).
- **Settings / integrations slash-commands** in the chip (`/settings`, `/integrations`, `/export`).
- **Grid view re-design** (if we keep it) — column-count cap, image-less card treatment, density pass.
- **Color token pass** — tint neutrals toward the brand hue (OKLCH chroma 0.005–0.01 toward the orange). Currently neutrals read as zinc.
- **Type scale pass** — 5 sizes with ≥1.25 ratio; pick a display weight for hero moments so mono has internal contrast.
- **Dark mode pass** — apply all of the above to the dark variant.
- **Accessibility** — `aria-label` on all icon-only buttons, `:focus-visible` throughout, keyboard list navigation (j/k or arrows), reduced-motion compliance across the board.
- **Mobile polish** — responsive collapse of the two-column grid into a stacked layout with sensible affordances.
- **Tabular numerics audit** — every count/date/timestamp uses `font-variant-numeric: tabular-nums`.

### Decisions

Break each item into its own sub-PR and ask the user at the start of each. Phase 5 is deliberately not over-planned.

---

## Cross-cutting concerns

### Theme / token pass (prerequisite — do before or during phase 1)

- **Color tokens** — tint neutrals toward the brand orange hue. Current neutrals are effectively neutral zinc; a subtle OKLCH chroma shift (0.005–0.01 toward the accent hue) makes the UI read as coherent with the accent.
- **Type scale** — 5 sizes with ≥1.25 ratio between steps; pick a display weight for hero moments so the mono voice has internal contrast.
- **Tabular figures** — enable OpenType `tnum` on numeric UI globally (or per-component where needed).
- **Spacing / radius** — semantic token names (`--space-sm` not `--spacing-8`).

### Rendering performance at 500+ items (phase 2 detail)

**Goal:** 500 links render smoothly without a virtualization library. Virtualization stays in reserve for 2k+.

**Biggest hitters in the current code** (from `link-card.tsx` / `link-image.tsx`):

1. Per-card Livestore subscriptions (`linkProcessingStatus$` + `tagsForLink$`) → 1000 subscriptions at 500 cards.
2. Eager image decode — no `loading="lazy"` / `decoding="async"`.
3. No `React.memo` + `toLocaleString` called per render.
4. DOM weight (~20 elements × 500 rows).

**Strategy (option (c) from the query-approach discussion):**

- Single list query returns the link array.
- Map side-queries: `tagsByLink$` → `Map<linkId, Tag[]>`; `statusByLink$` → `Map<linkId, Status>`.
- `LinkRow` wrapped in `React.memo` with props `{ link, tags, status, onClick }`.
- Stable callbacks: parent provides a single `useCallback`; row surfaces `data-id` on DOM; no inline closures.
- Format dates in parent; pass formatted strings down.

**Resolved: Livestore reference stability** — Livestore does NOT preserve inner refs across recomputes (broadcasts produce fresh outer refs). We handle this with two defensive patterns, both landed 2026-04-22:

- Custom memo comparator on `LinkCard` / `LinkListItem`: fast-path `prev.link === next.link`, fallback field-by-field on the consumed fields; `tags` / `processingStatus` / `formattedDate` / `selected` / `selectionMode` / `onClick` compared by reference.
- A `useStableTagsByLink` cache hook in `link-grid.tsx` that groups raw rows into `Map<linkId, readonly Tag[]>` and **preserves the previous per-link array reference when its content hash is unchanged**. This is what makes the per-row memo skip reliably even though Livestore hands back fresh outer refs.

**CSS-native "virtualization":**

- `content-visibility: auto` on each row.
- `contain-intrinsic-size: <row-height>px` (exact px, to keep scrollbar stable).

Supported in modern Chrome, Safari 18+, Firefox 125+. Matches the "optimize for modern browsers" scope.

**Expected net effect at 500 items:**

- Livestore subscriptions: ~1000 → 3.
- Eager image requests: 1000 → only visible rows.
- Per-event re-render cost: full list → one affected row.

---

## Open questions

### Design-ish

- **Dark mode** — ship alongside the new light, or light-first?
- **Grid view's future** — keep, redesign in phase 5, or deprecate?
- **Further list-mount perf** — current baseline is 81ms React commit + 180ms longtask for a 241-link route mount. Acceptable for now but worth revisiting after the redesign shakes out.

  **Profile findings (2026-04-22, Chrome DevTools Performance, PerfHUD disabled):**
  - Livestore `useQuery`: **14.3ms total** — SQL execute + schema parse + Map build combined. Not the bottleneck.
  - React scheduling (`createTask` + `Run console task`): ~90ms — scheduler overhead for mounting 244 fiber trees.
  - GC pressure (Major + Minor + C++): ~20ms — high allocation during mount.
  - Browser render (style/layout/paint): ~20ms.
  - React commit itself: ~2ms (the reconciliation floor is tiny; cost is the surrounding work).

  **Conclusion:** SQL is fast (indexes work). The cost is React reconciling 244 card fiber trees on first mount + GC from that allocation. IVM (materialized view of latest snapshot per link) shelved — would save maybe 2-5ms of the 14ms query cost, not worth the complexity.

  **Candidates if returning to this:**
  - Flatten per-card DOM (currently 10+ fiber levels per card: `button > Card > CardHeader > div > img+span+CardTitle+CardDescription > CardContent > div > TagBadge[]+span`). Cutting to 3–4 elements per card reduces both reconciliation and GC pressure simultaneously.
  - Query pagination (`LIMIT 50` + keyset pagination on `createdAt` + load-more sentinel). Linear reduction across all costs — fewer rows parsed, fewer cards mounted, less GC. Keyset avoids OFFSET's scan-and-discard antipattern.
  - `startTransition` on route navigation to chunk the longtask so it doesn't block input (doesn't reduce total time).
  - Pre-warming queries at app start without mounting their render trees — doesn't help first visit, might help subsequent.
  - **Rejected / tried:** `<Activity>` keep-alive (effect cycle re-runs queries), CSS `display:none` pre-render (user rejected both), virtualization (user rejected).

### Product-ish

- **Weekly Digest source** — server-side cron, on-demand AI, or placeholder first?
- **Export format** for multi-select.
- **Tool calls** from the agent — scope for MVP.
- **Link-attached chat context** — how attached link state is shown.

### UX-ish

- **Mobile layout strategy** — start in phase 1 or defer to phase 5.
- **URL state for selected link** — shareable `/inbox?link=ID` or none.
- **Time grouping boundaries** — rolling 7d or calendar-based.

---

## Progress log

_Append entries as we iterate, newest first._

### 2026-04-22 (late) — cleanup pass + perf floor characterized

**Cleanup pass (Opus agent):** deleted `src/components/app-sidebar.tsx`, `src/components/ui/sidebar.tsx`, and `src/components/link-card/index.ts` (barrel, violated "no barrels" convention). Renamed `useStableTagsByLink` → `useTagsByLink` (cleaner API). Dropped redundant `Object.freeze` on empty-tags constant. Switched `SyncStatusIndicator` to selector-based zustand subscription. Various small inline-style and dead-class removals. Preserved: multi-select dead code (phase 3 resurrection), PerfHUD, detail modal.

**Perf characterization via Chrome DevTools Performance profiling** (PerfHUD disabled during recording, zoomed to just the route-switch longtask):

- Livestore `useQuery`: **14.3ms total** — our four composite indexes are doing their job. SQL is not where the cost lives.
- React scheduling (`createTask` + `Run console task`): ~90ms — scheduler overhead for 244 fiber trees on first mount.
- GC (Major + Minor + C++): ~20ms — allocation pressure.
- Browser render (style/layout/paint): ~20ms.
- React commit itself: ~2ms.

**Conclusion:** the 180ms longtask is ~90ms React scheduling + ~20ms GC + ~20ms browser work + ~14ms query + ~30ms router/JSX/misc. IVM would save maybe 2-5ms; decisively shelved. Real leverage points (if we return to this) documented in Open Questions.

Phase 1 is done. Phase 2 next session.

### 2026-04-22 (overnight) — architecture reverted, indexes added

Over the course of iteration, landed and reverted the following perf experiments: (a) an Opus-agent refactor that lifted shell to `_authed.tsx`, made category routes render `() => null`, and used `<Activity>` to keep category list trees alive. Measurement showed subscription re-subscribe on `<Activity>` visibility toggle, producing an 85ms nested-update commit per switch — the effect-cycle semantics of Activity meant Livestore `useQuery` re-subscribed every time. Not the win we wanted. (b) Considered CSS `display:none` always-mounted pattern for true keep-alive, but user rejected both approaches — "hacky, weird, silly".

**Landed instead — simpler baseline:**

- Restored normal TanStack Router mount/unmount per category route. Route files have real components again (`HomePage`, `AllLinksPage`, `CompletedPage`, `TrashPage`), each calling its own Livestore query.
- Shell stays lifted to `_authed.tsx` (TopBar + Masthead + 1400px frame + hairline). Category routes render inside the shell via `<Outlet />`. `/brand` gets the bare-outlet branch.
- `ListDataProvider` kept at shell level for global `tagsByLink$` + `processingStatusByLink$` — subscribes once per session.
- Deleted: `CategoryListContainer`, `KeepAliveCategoryLists`, `<Activity>` wrapping. Drop `page-shell.tsx` (agent already removed).
- Added composite indexes to `links` table: `(status, deletedAt, createdAt)`, `(deletedAt, createdAt)`, `(status, deletedAt, completedAt)`, `(deletedAt)`. These target the WHERE + ORDER BY shapes of the four category queries. Livestore applies at next boot, no migration step needed.
- Lean list queries retained: `summary` and `source` already dropped from `inboxLinks$` / `allLinks$` / `completedLinks$` / `trashLinks$`. Detail / search / export keep them.

**Trade-offs accepted:** per-route mount cost stays at ~77ms for 244 cards (React reconciliation floor without virtualization; virtualization remains rejected). Indexes reduce the SQL portion of the 220ms longtask. Global tag/status subscriptions no longer cycle per category switch.

### 2026-04-22 (late evening) — multi-select disabled + perf instrumentation

- **Perf instrumentation landed.** `src/components/perf-hud.tsx` — dev-only floating HUD showing FPS, long-task count/duration (5s window), and last React commit from `<Profiler>` wrapping `<LinkGrid>`. Click HUD to copy a snapshot to clipboard (FPS, longtasks with offsets, last N commits). Mounted in `_authed.tsx` behind `import.meta.env.DEV`.
- **First measurement on `/all` with 244 links** showed: initial mount 92ms + 287ms longtask (one-time, tolerable); Cmd-spam triggered 75–105ms commit per keypress (all 244 cards re-rendering because `selectionMode` was a per-card prop). Root cause: every modifier key toggled `isSelectionMode` → propagated to all cards via props → memo correctly saw prop change → all 244 re-rendered.
- **Multi-select feature disabled** as temporary measure — will be rebuilt properly in Phase 3 as the right-pane selection view. Deletions across `link-grid.tsx` (useSelectionStore, useHotkeys, isSelectionMode state, modifier-click handling, onSelectionChange effect), `link-card.tsx` + `link-list-item.tsx` (selected/selectionMode props + CheckIcon overlay + selection-mode hover variants), `links-page-layout.tsx` (SelectionToolbar, selectedLinks state, bulk handlers wiring), and all four route files (bulk action handlers + `toolbarConfig` passing). Export dialog now exports the current filtered list only.
- Dead code preserved for resurrection: `src/stores/selection-store.ts`, `src/components/selection-toolbar.tsx`.

### 2026-04-22 (evening) — Phase 2 perf subset + polish

**Perf strategy landed ahead of Phase 2 schedule** (user observed jank at ~250 links):

- New queries: `tagsByLink$` in `src/livestore/queries/tags.ts` (raw join rows), `processingStatusByLink$` in `src/livestore/queries/links.ts` (raw rows).
- `LinkGrid` owns the lifted queries, builds a `Map<linkId, readonly Tag[]>` via `useStableTagsByLink` cache hook (content-hash comparison preserves per-link array refs across recomputes — the critical bit for memo skip).
- Processing status passed as plain `string | null` — value-stable by `===`, no cache needed.
- `LinkCard` and `LinkListItem` wrapped in `React.memo` with custom comparator (fast-path `prev.link === next.link`, fallback field-by-field on used fields; refs for tags/status/formattedDate/selected/selectionMode/onClick).
- `data-id` stable callback pattern: single `useCallback` on `LinkGrid`, row root has `data-id={link.id}`, handler reads from `e.currentTarget`.
- `formattedDate` computed in parent, passed as prop. No more `new Date(...).toLocaleString(...)` per card per render.
- `[content-visibility:auto]` + `[contain-intrinsic-size:360px]` on grid cards, `100px` on list rows.
- `loading="lazy" decoding="async"` on thumbnails and favicons in `link-image.tsx` and card headers.
- All 534/534 tests pass. Kept `tagsForLink$` and `linkProcessingStatus$` factories exported (still used elsewhere).

**Result:** improved but still feels "a bit blocking". Need instrumentation next (see Phase 2 in-scope).

**Polish pass:**

- Dropped all inline `style={{ ... }}` in masthead / top-bar / page-shell — Tailwind arbitrary values now.
- `max-w-[1400px]` → `max-w-7xl` (closest default).
- Meta-line `reduce` replaced with `links[0]?.createdAt` across routes (queries already `ORDER BY … DESC`).
- `time-ago.ts` rewritten with `Intl.RelativeTimeFormat` (`numeric: "auto"`, `style: "narrow"`); accepts `Date | number | null | undefined`.
- `DotsMenu` uses `EllipsisVerticalIcon` from lucide (custom SVG dropped); DropdownMenu primitives unchanged.
- `Masthead` radically simpler (220→155 lines): drop `useLayoutEffect` + `useRef` + `ResizeObserver` + measurement span. Now: sort tags by count, slice top 5, clicking `+N more` **expands the strip inline** (local state toggle to "less"); no tag-manager trigger on that button.
- `PageShell` dropped the now-unused `onManageTags` prop and duplicate `TagManagerDialog` (still reachable via `⋯` menu).

**Kanban add:**

- "Restore multi-select behaviour for tag filter" under Todo — current tag filter toggles single, should allow multiple active tags.

### 2026-04-22 — Phase 1 shipped

- Phase 1 executed in one Opus subagent pass (no worktree, direct write).
- New components: `src/components/top-bar.tsx`, `src/components/masthead.tsx`, `src/components/dots-menu.tsx`, `src/components/page-shell.tsx`, `src/lib/time-ago.ts`.
- Modified: `src/routes/_authed.tsx` (neutralized to providers + outlet), four main route files (each wraps content in `<PageShell>`), `src/components/links-page-layout.tsx` (dropped old title), `src/components/sync-status-indicator.tsx` (refactored to inline badge, always visible with "synced" label).
- Admin/brand handling: **each route decides** — they opt in by wrapping in `PageShell`; admin/brand don't. Chosen over branching inside `_authed.tsx`.
- Sidebar-to-menu mapping applied per locked decisions: logo → wordmark (`CloudstashLogo branded`), Add → plus icon, category nav → inline masthead text, sync → top-right badge, everything else → `⋯` menu (Agent stubs to existing chat sheet).
- Meta copy per route applied: Inbox `X unread · last added Y`; All `X links · last added Y`; Completed `X completed · last completed Y`; Trash `X in trash · M expiring soon` (falls back to static copy when M=0).
- Typecheck + check + test all pass.
- `app-sidebar.tsx` and `ui/sidebar.tsx` left on disk unused — follow-up deletion pass pending.

### 2026-04-22 (morning) — plan + prototype decision

- Decided: **v3c-home2** prototype is the adopted feature reference. Rejected alternatives: layout-shift (v2), push drawer (v3a), overlay drawer (v3b), persistent-split with recent-links (v3c-home).
- Added a five-phase implementation plan: (1) outer shell; (2) list + home right-pane; (3) detail + multi-select in right pane + animations; (4) command chip; (5) remaining.
- Noted explicit "ask the user" decision points per phase — the plan is intentionally incomplete where design conversations haven't covered the detail.
- Flagged existing app features to respect during implementation (ingestion sources, processing states, tags, multi-select, export, chat/agent, admin, auth, keyboard, sync).

### 2026-04-21

- Wrote `.impeccable.md` design context (precise / light / premium; mono identity; warm orange accent; light-mode first).
- Sketched three initial layouts (A / B / C); later iterated to four chrome strategies (Masthead / Top tabs / Chromeless / Date rail); converged on Masthead.
- Iterated the Masthead prototype through v2 (split grid), v3a/b/c (push / overlay / persistent split), v3c-home (home view added), v3c-home2 (feedback applied: left masthead, horizontal activity, weekly digest replacing recent list, blur-slide animations, multi-select state).
- Decided perf strategy: lift queries + `React.memo` + stable callbacks + `content-visibility`; no virtualization library at 500 items.
