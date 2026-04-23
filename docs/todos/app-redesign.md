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
- **Phase 2 — List + right-pane default**: ✅ shipped (2026-04-22). Grid view removed (client-only; livestore schema/events untouched). List row rebuilt to prototype anatomy (grid `1fr 5rem`, title / domain / 2-line desc / tags+ago foot, 80×45 OG-ratio thumb with monogram fallback). Right-pane home view stubbed (`weekly-digest.tsx`) and made sticky (`top-8` + `max-h` + `overflow-y-auto`). `FilterBar` dropped from the list page (masthead tag strip replaces it). Export button moved to the right pane via a small React context (`page-actions-context.tsx`). Relative `formatAgo` now used for list dates. `link-card/` directory flattened → `link-list/` (list-specific files) + `link-image.tsx` moved to top-level (used outside lists).
- **Phase 2 perf (applied ahead of schedule)**: ✅ lifted `tagsByLink$` + `processingStatusByLink$` queries, `React.memo` with custom comparator on `LinkCard` / `LinkListItem`, `data-id` stable callbacks, `formattedDate` passed from parent, `content-visibility: auto` + `contain-intrinsic-size`, lazy/async images. **Observed result: improved but not yet smooth at 250+ links.** Next step is in-app instrumentation (see "Performance instrumentation" in Phase 2 in-scope).
- **Phase 3a — Detail view in right pane + animations**: ✅ shipped (2026-04-23). Modal `src/components/link-detail-dialog/` deleted. New `right-pane-context.tsx` owns `{ activeLinkId, projection }` + `openDetail` / `closeDetail` / `toggleDetail` / `navigate`. `DetailView` in `src/components/right-pane/detail-view.tsx`: hero image (no outline) or monogram, meta line (domain · ago · source · status), bold 28px title, description, hairline, markdown summary with reprocess, tag editor + suggestions, `BorderTrail` on processing. Sticky action header: prev/next as kbd-style `[` `]` `Button`s + `n/total`, primary `Complete` as text+hotkey chip (⌘↵), copy + external-link + `⋯` overflow all as `Button size="icon-sm" variant="ghost"` (one design-system recipe end-to-end). Delete moved into `⋯` menu. Keyboard scope `"detail"`. `Esc` closes. Hit area for `[` `]` is 28×28 (below 40×40 — accepted given keyboard-first brand). Right pane swaps between `home` (WeeklyDigest) and `detail` via `AnimatePresence mode="wait"` using motion springs (bounce 0, duration 0.22) + 80ms tween exits + reduced-motion fallback to 100ms opacity crossfade. List row gets an `active` bool prop → subtle `bg-muted/60`, with always-on `-mx-3 px-3 py-2` to create the "bleeding bg" hover effect without layout churn. Click on a row toggles the detail; clicking the currently-active row closes.
- **Phase 3b — Multi-select in right pane**: 🟡 deferred — queued on kanban. Old dead code still preserved (`src/stores/selection-store.ts`, `src/components/selection-toolbar.tsx`).
- **Phase 3c — further animation polish**: not started. Open: consider disabling the detail→detail swap animation and keeping the animation only on open (home → detail) and close (detail → home). The current behavior animates every link change, which can feel heavy on rapid navigation.
- **Phase 4 — Floating command chip (search-only scope)**: ✅ shipped (2026-04-23). Old `CommandDialog`-based search retired: `src/components/search-command.tsx` + `src/stores/search-store.ts` deleted. New `src/components/command-chip.tsx` is a persistent bottom-centered `<label>` pill (480px, `rounded-full`) that expands a panel upward on focus. Reuses existing `searchLinks$` + `recentlyOpenedLinks$` livestore queries; no new queries. ⌘K toggles; Esc / pointer-outside / Tab-away close; clicking the pill focuses the input via native label behavior. `AnimatePresence` on the panel with the project's standard spring (bounce 0, duration 0.22) + 80ms tween exit + reduced-motion opacity crossfade. `highlighted-text.tsx` default yellow swapped to `bg-primary/15 dark:bg-primary/25` — the match highlight is now the first place the warm-orange accent appears in this surface. Rows reduced to favicon + domain + title only; status dots/badges dropped (search is for finding, status lives in the detail view). Layered warm-tinted shadows `rgb(61 40 20 / …)` on both pill and panel (tight 1px contact + wider lift), warm-tinted border `border-primary/10` that tightens to `border-primary/25` on focus. Microcopy: `N matches` (tabular-nums, pluralized) / `Nothing matches "foo"` / `Type to search`. TopBar search button removed (chip is persistent so it's redundant). **Explicitly out of scope:** agent mode, mobile treatment, keyboard hints footer, query scoping (`domain:`, `tag:`), recent-query memory, ⌘↵ open-in-new-pane. The existing chat sheet is still mounted separately — not subsumed.
- **Phase 5**: not started.
- **Multi-select temporarily disabled** (2026-04-22 evening): selection store / hotkey tracking / modifier-click handling / `SelectionToolbar` all unwired. Reason: selection-mode hotkey was re-rendering all 244 cards on every Cmd keypress. To be rebuilt in Phase 3b as the right-pane selection view. Dead code preserved (`selection-store.ts`, `selection-toolbar.tsx`) for resurrection.
- **Perf architecture decision (2026-04-22 late evening)**: pursued and rejected both `<Activity>` keep-alive and CSS `display:none` pre-rendering. Normal TanStack Router mount/unmount per route restored. Approach: keep the queries fast via composite indexes + keep the shell mounted (global work stays mounted across category switches). Accept the per-route mount cost (~77ms for 244 cards) as bounded by React's reconciliation floor. Indexes added on `links(status, deletedAt, createdAt)`, `links(deletedAt, createdAt)`, `links(status, deletedAt, completedAt)`, `links(deletedAt)`.
- **Phase 1 cleanup pass** (2026-04-22 overnight): deleted `app-sidebar.tsx`, `ui/sidebar.tsx`, and the `link-card/` barrel. Various small polish — inconsistent naming fixed, redundant allocations dropped, inline styles eliminated. 534/534 tests still pass.
- **Perf floor understood** (2026-04-22 overnight, Chrome DevTools profiling): at 241 links, SQL is fast (14ms total via composite indexes), React scheduling + GC dominates (~110ms combined). IVM shelved — not where the cost lives. Detailed findings in Open Questions below.

## Remaining work

Single consolidated list of what's left from the original 5-phase plan, merging phase 3b / 3c deferrals, phase 4 follow-ups, and the phase 5 tail. Rough priority ordering; re-triage when picking one up. Each item owns its own sub-PR.

- **Phase 3b — Multi-select as a right-pane view.** Revive `src/stores/selection-store.ts` + `src/components/selection-toolbar.tsx`. Add `selection` to the `RightPaneContext` state machine (home/detail/selection). Active-row 12×12 accent checkmark, bulk actions (complete/archive/tag/export/clear), count + top-3 titles + "+N more", modifier hints. Reuse existing `ExportDialog` for export. Decide tag-applier behavior (picker popover with add/remove toggles). Esc priority: selection → detail → home. Also resolves the `SelectionToolbar` / `CommandChip` `fixed bottom-*` collision once the standalone toolbar goes away.
- **Phase 4 agent mode.** Type → Tab → ask flow inside the chip. Link-attached chat from the detail view (`✱ chat about this`). Streaming responses via existing AI SDK + OpenRouter. Context strategy open: N most recent vs top-K keyword-matched vs hybrid. Chat history persistence TBD.
- **Chat sheet removal.** `src/components/chat/chat-sheet.tsx` still mounted in `_authed.tsx` alongside the chip. Remove once agent mode lands in the chip so there's a single chat surface.
- **Query scoping in the chip** (`domain:`, `tag:`, `status:`). Power-user utility given the keyboard-first brand. `searchLinks$` already has the backend shape to support it.
- **`⌘↵` open-in-new-pane (or new tab) from chip results.** Currently the only action on a result is click/Enter → replace the right-pane detail. Modifier gives a non-destructive path.
- **Recent-query memory.** Chip's empty state currently shows recently-opened links; add a layer for recently-typed queries.
- **Phase 3c — detail → detail swap animation + image prefetch.** Currently the swap is instant (the outer `motion.div` is keyed by mode `"detail"`, not linkId). Design a <100ms swap animation inside `DetailView` (cross-fade hero + title + summary; keep action header static, or a per-field blur pulse). Also prefetch hero image + favicon on list-row hover (`<link rel="preload" as="image">` or `new Image().src = url`) to avoid the flash from empty → loaded — worth measuring.
- **Keyboard hints footer in the chip** (`↑↓ navigate · ↵ open · esc close`). Skipped during the phase-4 critique pass but still the right move for teaching-via-inline-hints per the brand principle.
- **Settings / integrations slash-commands in the chip** (`/settings`, `/integrations`, `/export`). Grows the chip from search-only toward a command surface without adding agent mode.
- **Activity indicator** in the right-side header slot — 7-day bar chart from the prototype. Needs a query aggregating daily link counts. Decide window (last 7d, last 30d, rolling).
- **Mobile treatment** — starts with the chip (480px fixed-width overflows on narrow viewports) and radiates outward (two-column collapse, touch targets, responsive masthead).
- **Accessibility sweep** — `aria-label` on all icon-only buttons, `:focus-visible` throughout, keyboard list navigation (`j`/`k` or arrows), reduced-motion compliance across the board.
- **Color token pass** — tint neutrals toward the warm-orange brand hue (OKLCH chroma 0.005–0.01). Currently neutrals read as zinc. Small shift across the token set.
- **Type scale pass** — 5 sizes with ≥1.25 ratio; pick a display weight for hero moments so the mono voice has internal contrast.
- **Dark mode pass** — apply the light-mode polish to the dark variant (colors, type scale, shadow alpha, border tokens).
- **Tabular numerics audit** — every count / date / timestamp uses `font-variant-numeric: tabular-nums`. Sweep via code search.
- **Hit-area review** on detail-view action cluster. `[` `]` nav, copy, external-link, `⋯`, and the `Complete` HotkeyButton are all ~28×28, below the 40×40 accessibility floor. Extend via `before:absolute before:inset-[-6px]` pseudo-element to preserve the 28px visual while meeting the hit-box floor. Confirm no overlap between adjacent buttons first.
- **Further list-mount perf improvements.** Baseline 180ms longtask at 241 links on first route mount. SQL is not the bottleneck (Livestore useQuery is 14ms). Leverage points: flatten per-card DOM (currently 10+ fiber levels), query pagination with LIMIT + load-more, `startTransition` to chunk the longtask.

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

### 2026-04-23 (phase 4) — floating command chip replaces modal search, search-only scope

**Scoped narrower than the original plan.** The full phase 4 described in the plan below includes agent mode, link-attached chat, and subsumes the existing chat sheet. User scoped this pass to **search only** — agent mode, mobile treatment, and chat sheet removal all deferred to a later pass. The chip is a drop-in replacement for the old Cmd+K modal, nothing more.

**Old surface retired.** Deleted `src/components/search-command.tsx` (the `CommandDialog`-based centered modal) and `src/stores/search-store.ts` (the zustand open/close store). `_authed.tsx` no longer imports them; `top-bar.tsx` no longer renders a search button (the chip is persistent, so a top-bar affordance is redundant).

**`CommandChip`** (`src/components/command-chip.tsx`): `position: fixed; bottom-7 left-1/2 -translate-x-1/2; z-50; w-[480px]`. Outer `<div role="search">`; inner cmdk `<Command shouldFilter={false}>` (livestore does the filtering). The pill itself is a `<label>` — native labeled-input behavior lets clicks on padding / `SearchIcon` / `Kbd` focus the input without a custom `onMouseDown` handler and without a lint rule firing for "div with event handler". `CommandPrimitive.Input` is used directly (not the project's wrapped `CommandInput`, which assumes a Dialog layout) with `aria-label="Search links"`. `Kbd` and `SearchIcon` get `aria-hidden="true"`.

**State.** All local to the component: `open` boolean + `value` string. Opening paths: ⌘K global keydown, input focus (from tab or click-to-focus via label). Closing paths: ⌘K toggle, Esc on input (with `stopPropagation` — belt + suspenders against the detail-scope Esc), `onBlur` with `relatedTarget` check (closes on Tab-away), pointer-outside listener registered only while open. `close` is a `useCallback` so the pointerdown effect has honest deps (no `eslint-disable`).

**Queries.** Reuses existing `searchLinks$(query)` and `recentlyOpenedLinks$` from `src/livestore/queries/links.ts`. `useDeferredValue(value.trim())` keeps typing responsive while the query runs. `lastTrackedQuery` ref dedupes analytics to once per query-change. Livestore dedupes `searchLinks$(q)` by query-content hash — per-render factory calls don't churn subscriptions.

**Panel.** `AnimatePresence initial={false}` wraps a single `motion.div` keyed `"panel"`. Enter: `y: 8 → 0`, `filter: blur(4px) → 0`, spring bounce 0 duration 0.22. Exit: 80ms tween `y: 4`, no blur. Reduced-motion: 100ms opacity crossfade. Height `max-h-96` (~8 rows). Contents: `N matches` heading with tabular-nums on typed queries, `Recently opened` heading on empty state, `Nothing matches "…"` / `Type to search` on empties. Rows are `favicon + domain + title` only — no status dots, no arrow icons, no per-row badges. Status is the detail view's job.

**Color + chrome (post-critique).** First pass was flagged as "default-shadcn-with-animation" with zero warm-accent presence — the critique scored 26/40 Nielsen, 55/100 slop. Addressed:

- `highlighted-text.tsx` default: yellow → `bg-primary/15 dark:bg-primary/25`. Match highlight is now the first visible warm-orange moment in the chip.
- Shadows rewritten as layered warm-tinted recipes on both pill and panel: `0_1px_2px_rgb(61_40_20_/_0.08),0_10px_28px_-8px_rgb(61_40_20_/_0.24)` on the pill, `0_1px_2px_rgb(61_40_20_/_0.08),0_12px_36px_-10px_rgb(61_40_20_/_0.26)` on the panel. Dark mode falls back to pure-black at higher alpha (warm tints don't read on dark surfaces). Both stay under 25% alpha — within the "no heavy shadows" brand rule.
- Border: `border-primary/10` → `border-primary/25` on focus. Dark mode falls back to `border-border`.
- Radii: pill `rounded-full`, panel `rounded-lg` (inner `CommandItem` is `rounded-none` and fills panel edges). Three levels but no longer chaotic.
- Microcopy tightened: `Results (12)` → `12 matches`, `No links for "foo"` → `Nothing matches "foo"`, `Type to search your links` → `Type to search`.

**Kept generic-but-acceptable.** `Kbd` primitive itself (`ui/kbd.tsx`) is still shadcn-default (`bg-muted` + `shadow-sm`, no warm tint). Out of scope for this pass but flagged in the critique as a future polish target.

**Out of scope this pass:**

- Agent mode and link-attached chat.
- Chat sheet removal (`src/components/chat/chat-sheet.tsx` still mounted in `_authed.tsx`).
- Mobile treatment — on small viewports the 480px fixed-width pill will overflow. Deferred.
- Keyboard hints footer (`↑↓ navigate · ↵ open · esc close`) — user skipped this one in the critique action plan.
- Query scoping (`domain:`, `tag:`), `⌘↵` open-in-new-pane, recent-query memory.
- `SelectionToolbar` collision: `selection-toolbar.tsx` is also `fixed bottom-6 left-1/2 z-50`. Multi-select is currently unwired (see 2026-04-22 log), so the collision isn't visible. Phase 3b rebuilds selection as a right-pane view; the standalone toolbar goes away and the collision resolves with it. Noted on the phase 3b kanban item.

**Verification.** 534/534 tests pass, typecheck clean, `vp check` / oxlint / Effect diagnostics all clean. Code review subagent returned "ship it" — no blocking issues. Should-fixes addressed: click-to-focus (via `<label>`), Tab-away close, `aria-hidden` on Kbd/SearchIcon, `aria-label` on input, over-memoized `.trim()` inlined.

### 2026-04-23 (phase 3a) — detail in right pane, modal retired, animations

**Modal retired.** `src/components/link-detail-dialog/` deleted entirely. New state owner `src/components/right-pane-context.tsx` manages `{ activeLinkId, projection }`, exposing `openDetail({linkId, projection})` / `closeDetail()` / `toggleDetail(...)` / `navigate(linkId)`. Resets on `useLocation` pathname change (route switch closes detail). Callers updated: `LinksPageLayout` uses `toggleDetail` on row click (opens, or closes if already active), `SearchCommand` / `AddLinkDialog` / `LinkMention` use `openDetail`. Also dropped the duplicate `trackLinkOpen` in `LinkList` so analytics fire once per real open.

**`RightPane` + `DetailView`** (`src/components/right-pane/`): sticky aside spanning the viewport. When no link active: `WeeklyDigest` (digest stub + Export button via `page-actions-context`). When active: `DetailView` inside a `ScrollArea` (new `src/components/ui/scroll-area.tsx` wrapping `@base-ui/react/scroll-area`). Detail layout per prototype: sticky action header at top, hero (16:9 image or 4xl monogram), meta line (domain / relative ago / source badge / status), `text-[28px] font-extrabold` title, description, hairline, `DetailSummary` (markdown + loading/failed states, reprocess in the `⋯` menu), tag editor + `TagSuggestions`, `Esc to close` hint at bottom. Hotkey scope `"detail"`; bindings for `Escape`, `[` / `]` prev-next, `⌘↵` complete.

**Action header (unified design system)** — the seven-different-icons cluster was a critique P1. Rebuilt:

- Prev/next as `Button size="icon-sm" variant="ghost" font-mono` with `[` `]` characters + a `NavHint` showing `currentIndex/total`.
- Primary `Complete`: `HotkeyButton size="sm" variant="ghost"` (text + icon + modifier-hold `Kbd` overlay via `HotkeyButton`'s built-in behavior).
- Copy, external link (`Button` with `render={<a>}` + `nativeButton={false}`), and `⋯` trigger all `Button size="icon-sm" variant="ghost"`.
- Delete moved into `⋯` menu (immediate; menu open is itself the "intent" step). No more inline 2-step confirm state — simpler.
- All buttons share the `Button`'s `rounded-none` base — no more hand-rolled `rounded-md size-8` divs.

**Animations** (`right-pane.tsx` via `motion/react`): `AnimatePresence mode="wait"` keyed by `detail:<linkId>` / `home`. Direction computed from prev/next mode via a tiny `usePrevious` hook. Forward (any → detail, detail→detail): spring enter from `x: -16` + `blur(4px)` (bounce 0, duration 0.22), 80ms tween exit `x: -6`. Reverse (detail → home): spring enter from `x: -4` (no blur), 80ms tween exit `x: 6`. Reduced-motion: 100ms opacity crossfade only, no transform/blur. Follows the impeccable skill's spring-bounce-0 pattern.

**TagStrip moved to full-width row**: previously inside `LinksPageLayout`, now a dedicated row in `_authed.tsx` between the masthead grid and the hairline. Spans both columns (`max-w-7xl`). `TagStrip` and `CategoryNav` extracted from the old `masthead.tsx` into their own files.

**Tag filter single-select** (2026-04-23 late): `useTagFilter` rewritten to a single `tag: string | null` (URL param `?tag=<id>`, nuqs `parseAsString`, nullable). Button handlers call `setTag(active ? null : tag.id)`. `TagBadge` stripped of color coding (no more `getTagColor` / `tagColorStyles` — just `#name` in `text-muted-foreground`). `CategoryNav` uses `search={(prev) => prev}` on each `<Link>` so tag selection rides along on route change. Deleted orphaned `src/components/filters/tags-filter.tsx` and `filter-bar.tsx` (phase-2 survivors that were the last consumers of the multi-select API). `tag-colors.ts` kept because `tags/tag-row.tsx` (tag manager) and `tags/tag-combobox.tsx` (picker) still use it.

**Masthead condensed to title + meta only**. `CategoryNav` lives in `TopBar` (beside the wordmark, `gap-10` from the logo), `TagStrip` is its own full-width row. Eyebrows (digest label, Summary, Tags) switched from `font-medium uppercase tracking-widest` to `font-semibold` — drops the shadcn reflex. Heroes unified: `font-extrabold` + `tracking-tight` on both masthead H1 (52px uppercase) and detail H2 (28px mixed-case).

**List row (phase-2 revert on critique feedback)**: the distill pass hid description + image at rest; user disagreed ("right pane already shows everything, so row description isn't redundant"). Reverted — list row always renders `title / domain / description / tags + ago` + full 80×45 thumb. Image outlines dropped (read as chrome). Search button added to `TopBar` with `⌘K` tooltip. Esc hint at the bottom of `DetailView`.

**Right pane padding**: `pb-8` moved from the aside/ScrollArea onto the content (`DetailView` root + `WeeklyDigest` root) so scroll reaches the full content without the last rows being clipped by padding on the scroll container. `pr-2` on content so it clears the scrollbar.

**Hook-order bugfix**: `store.useQuery(projection.query)` was conditional on `projection` — when closing, context set `projection: null` while `AnimatePresence` was still rendering the exiting detail, so the hook count changed. Fixed by always calling `useQuery` with a fallback (`projection?.query ?? inboxLinks$`) and discarding the result when projection is null. Livestore dedupes the subscription.

**Shipped without:** multi-select (phase 3b, deferred — kanban TODO). Further animation polish: decide whether detail→detail should skip the blur-slide and only animate on genuine open/close (phase 3c).

**Verification**: typecheck clean, `vp check` / oxlint / Effect diagnostics clean, 534/534 tests pass. Uncommitted at session end.

### 2026-04-22 (phase 2) — list rebuilt, grid removed, home pane stubbed

**Grid view removed (client-only).** Deleted `src/components/link-card/link-card.tsx`, `src/components/link-card/view-switcher.tsx`, `src/stores/view-mode-store.ts`. The `viewMode` toggle is gone. Livestore schema + event log intentionally untouched (per project rule). `link-image.tsx` survives — still consumed by `add-link-dialog`, `link-mention`, `link-detail-dialog`.

**Directory flattened.** `src/components/link-card/` → `src/components/link-list/` (list-specific files only), with `link-image.tsx` hoisted to `src/components/link-image.tsx` because it's used outside the list. Component rename: `LinkGrid` → `LinkList` (`link-grid.tsx` → `link-list/link-list.tsx`).

**New row anatomy in `link-list-item.tsx`** (follows `local/redesign-prototypes/1-masthead-v3c-home2.html`):

- Grid `1fr 5rem` with `gap-x-5`. Text stack on the left, rectangular thumbnail on the right.
- Title (semibold / `text-base` / `leading-snug` / `tracking-tight` / `text-pretty`), domain (`text-xs` muted), description (`text-sm` muted `leading-relaxed`, 2-line clamp, `text-pretty`), foot row (tag list muted left / ago right, both `text-xs`, ago `tabular-nums`).
- Thumbnail: `aspect-[16/9]` filling the grid track (5rem wide) to better fit OG images (1.91:1 canonical). Monogram fallback (first domain letter on `bg-muted`) fills the same rectangle when no image.
- Relative ago format via `formatAgo` (replaces the previous absolute `Intl.DateTimeFormat`).
- Tags inline as plain `#name` text (not `TagBadge`) per prototype.
- Memo comparator simplified to `prev.link === next.link` — Livestore replaces the object reference on any field change, so the prior ten-field walk was ceremony. Other props (tags, processingStatus, formattedDate, onClick) still checked by reference.

**`link-list.tsx` (was `link-grid.tsx`)** flattened: no viewMode branch, no `@container` grid; just a `flex-col` of rows. `useFormattedDatesByLink` now formats via `formatAgo`; cache by `createdAt` keeps the formatted string reference-stable for memo-skip.

**`LinksPageLayout`** simplified: dropped `FilterBar`, `TagsFilterDropdown`, `TagsFilterChips`, `ViewSwitcher`, `ExportDialog`, and the local `exportOpen` state. Registers `{ links, title }` into `PageActionsContext` on effect (clears on unmount) so the shell-level right pane can render the Export button without duplicating the route's query subscription.

**`PageActionsContext`** (`src/components/page-actions-context.tsx`): plain React context — `{ exportAction, setExportAction }`. Provider mounted in `_authed.tsx` inside `ListDataProvider`. Considered and rejected alternatives: a `zustand` store (rejected — prefer staying in-tree), deriving from `useLocation` in the right pane (rejected — ends up duplicating route-to-query mapping and spawning a second subscription), and a Livestore `clientDocument` (over-engineered for a phase-4-disposable feature; filtered list data doesn't belong in SQLite).

**Right-pane home view** (`src/components/weekly-digest.tsx`): section label `This week's digest`, placeholder paragraph (prototype text, for review realism), meta line marking it as a placeholder, and — when a list page is mounted — an Export button + dialog. Sticky on scroll (`sticky top-8 self-start max-h-[calc(100svh-4rem)] overflow-y-auto`) per prototype. Keyboard-hints footer, "ask about this week", and "dismiss" deliberately absent; queued on kanban.

**PX pass + deslop (impeccable skill).** Across `link-list-item.tsx`, `link-list.tsx`, `weekly-digest.tsx`, `link-image.tsx`:

- All arbitrary `px` values replaced with theme tokens (`text-xs`/`text-sm`, `rounded-sm`, `leading-snug`/`leading-relaxed`, `tracking-tight`/`tracking-widest`) or rem in brackets where no token fits.
- Lucide icons unified on `size-*` (no more `h-4 w-4` pairs).
- `text-balance` on short headings, `text-pretty` on wrapping body/title.
- `active:scale-[0.96]` on the Export button. Row-level scale intentionally skipped (feels wrong on a dense list).
- Redundant classes dropped (`self-start` duplicating grid `items-start`, `w-20` duplicating grid track, default `font-normal`, `tabular-nums` on non-numeric text).

**Kanban TODOs added:**

- Weekly Digest backend (source TBD: D1 cron vs on-demand AI vs both)
- Weekly Digest actions (ask / dismiss semantics)
- Keyboard hints footer in right pane
- Time-grouped list headers (Today / Yesterday / This week / Older) — deferred pending query-impact measurement
- Custom monogram fallback for image-less links

**Shipped without:** time grouping · selection tick (phase 3) · dismiss action · ask action · keyboard hints · blur-slide animation (phase 3). Modal-based detail still the click target.

**Verification:** 534/534 tests · typecheck clean · lint/format clean. No browser smoke-test this pass (dev port was occupied).

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
