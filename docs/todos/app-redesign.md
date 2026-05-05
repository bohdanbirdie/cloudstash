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
- **Phase 3b — Multi-select**: ✅ shipped (2026-04-29). Cmd-click toggles, shift-click extends a range. Selected rows get a 1.5px primary inset shadow ring (`shadow-[inset_0_0_0_1.5px_var(--primary)]`), fed by a per-id zustand selector (`useIsSelected`) so toggling one row doesn't re-render siblings. Single decision point in `right-pane-header.tsx`: renders `BulkActionHeader` (always-mounted for hotkeys) plus `PerLinkHeader` keyed by `activeLinkId` in an `AnimatePresence` — both fade with opacity + `filter: blur(4px) ↔ blur(0px)` over 120ms. `PerLinkHeader` is a self-contained sibling that owns its own `linkById$` / `linkProcessingStatus$` queries + action handlers — `DetailView` body is header-less, no portals, no slot context, no body-level animation (instant show/hide). The only motion that survived is the slot height `0 ↔ 48` (120ms ease-out) on `slotActive = !!activeLinkId || hasSelection`, plus the per-link/bulk header blur cross-fade. `BorderTrail` removed from `DetailView`. Bulk renders on top via `z-30 bg-background` so the swap is shift-free; both headers share `h-7` buttons + `pt-3 pb-2` for identical height. Count is `text-primary font-semibold`. Bulk cluster: route-aware `Complete`/`Reopen`, `Archive`/`Restore`, add-only tag picker (dedups via `tagsByLink$`), Export (reuses `ExportDialog` filtered against `PageActionsContext.exportAction.links`), Clear. Hotkeys under `selection` scope (⌘↵, ⌘⌫, ⌘E, Esc) gated on `count > 0`; detail's `⌘↵` and `Esc` gated on `!hasSelection`. Single-link header gained `↓ Export`. Plain click keeps the selection — clears only on ×, Esc, or route change (mount-time clear in `LinksPageLayout`). `removeStale` runs on link-set change. Old `selection-toolbar.tsx` deleted (resolves `CommandChip` z-50 collision). Bulk-header layout: `×` Clear sits on the left next to the count (co-located with what matters); action cluster (Complete/Archive/Tag/Export) on the right. **Perf pass after first build felt sluggish:** `RightPaneContext` split into `useRightPaneState` / `useRightPaneActions` so action-only callers (`CommandChip`, `AddLinkDialog`, `link-mention`, `DetailView`) skip the cascade on `activeLinkId` change. `WeeklyDigest` and `ActivityGrid` are `memo`'d and stay mounted across detail open/close (was previously remounting 180+ activity-grid tooltip cells per close). `DetailSummary` is `memo`'d with `useCallback(handleReprocess)`. `ExportDialog` instances lazy-mount in all three call sites. `useDeferredValue(linkId)` added in `PerLinkHeader` so held-arrow nav doesn't fire fresh livestore queries per keystroke. Body `motion.div` removed entirely — animations now exist only on the header surface, not the body, after the y-slide felt redundant once the slot pop was already drawing the eye. 13 new unit tests under `src/lib/__tests__/selection.test.ts`. **Post-3b iteration (same day):** the inset-ring selected state was replaced by a checkbox-slot system. Listbox container gets `data-selection-mode` (count > 0) and `data-modifier-held` (⌘/⇧ via a window keydown/keyup/blur listener with `hasAttribute` guard so DOM only mutates on edge transitions). Each row's slot is `display: none` by default and `block` when either attribute is present; content is a primary-filled circle + `<CheckIcon>` when `isSelected`, otherwise a `<CircleIcon>` cross-faded with a grayscale-filled-circle preview check on `group-data-[modifier-held]/list:group-hover` (instant, no transition). Active row simplified to `bg-muted` only — no bar, no orange fill. The hover-ring discoverability follow-up is supplanted by this slot system. `useInSelectionMode` boolean selector added to `selection-store.ts` and adopted in `LinkList`, `RightPane`, `PerLinkHeader`, `DetailView` — replaces `useSelectionCount() > 0` so those four only re-render at the 0↔≥1 threshold rather than every toggle. `removeStale` now clears `anchorIndex` when the selection wipes (`selectedIds.size === 0`), preventing phantom-anchor shift-clicks after a route filter or deletion (3 new tests under `selection.test.ts`, total 580). Export-modal polish: `Markdown` component gained styled `h1`/`h2`/`h3`/`hr`/`p` overrides (visible globally — applies to detail summary and chat too); `export-markdown.ts` dropped the page-level `# title Export` heading (now plain text) and demoted the per-link title from `##` to `###`; `LinkMention` tooltip's `Positioner` got `z-[60]` so the rich-preview tooltip renders above the export dialog instead of behind it. **Bulk tag picker rewrite (same day):** `BulkTagPicker` rewritten to mirror `TagCombobox` — `Input` for search, filtered list, "Create #foo" item when slug is unique. `slugify` + `events.tagCreated` + per-link `events.linkTagged` commit in one `store.commit(...)` call. `useHotkeyScope("popover")` disables `selection` scope while open so Esc closes the popover instead of clearing the selection. Tooltip on the trigger to match Export. Bulk header right cluster split into two groups with `gap-3` between them: labeled `Complete`/`Archive` (Archive promoted from icon-only to a `HotkeyButton` with label) on the left, icon-only Tag/Export on the right — extra gap protects the tag/export pair from accidental Archive clicks. Tag rows in `TagCombobox` dropped `tagColorStyles` — plain `#name` in `font-medium text-foreground`, matching `TagBadge` and the new bulk picker. Tag filter changes (`setTag` / `setUntagged` / `clearFilters` in `useTagFilter`) now drop the multi-selection — tag-strip clicks are list-shaping, so the prior selection becomes meaningless. Bulk picker apply/create does NOT drop the selection (so users can stack tags onto the same set). Tri-state per-tag was considered and rejected as too complex. **List row compaction + export move (2026-04-30):** meta line collapsed to one row — `domain · date · #tag1 #tag2 +N more` (max 2 tags then count); the standalone footer tags row was removed; `TagBadge` got `whitespace-nowrap` so individual tags never wrap. Description renders via `react-markdown` + `remarkGfm` with all formatting elements (`p`, headings, lists, `blockquote`, `pre`, `hr`, `strong`, `em`, `code`, `del`, `a`) flattened to fragments — markdown tokens are stripped but no inline styles are applied, so the preview reads as clean plain text. Title content width stays stable across selection-mode toggles via a paired gap/image-col adjustment: `grid-cols-[1fr_4.75rem]` (76px image col, down from 80) with `gap-x-8` (32px) default and `gap-x-2` (8px) when `data-modifier-held` or `data-selection-mode` is on; the 24px checkbox slot fills exactly the difference, and the residual 8px gap keeps the image breathing instead of slamming the title. Page-level Export moved from `WeeklyDigest` (the right-pane home view) into `DotsMenu` as a route-aware item — `Export inbox` / `Export all links` / `Export completed` / `Export archive` based on `exportAction.title`. The home view is now just the activity grid; `WeeklyDigest` no longer imports `ExportDialog` / `usePageActions` / `Button`.
- **Phase 3c — further animation polish**: ✅ shipped (2026-04-27). Decided detail→detail = no animation; only home↔detail boundary animates. The existing `motion.div` in `right-pane.tsx:54` is keyed by `mode` (not `linkId`), so detail→detail already remounts nothing and the swap is instant — matches the decision with no code change. Image flash on detail open is also a non-issue: list and detail use the same `link.image` URL with no optimization layer, so the browser HTTP cache serves the second load instantly. Dropped the redundant `loading="lazy"` on the detail hero `<img>` (always in viewport — never deferred).
- **Activity grid**: ✅ shipped (2026-04-27). 26-week × 7-day GitHub-style heatmap inside `WeeklyDigest`. Folder split: `src/components/activity-grid/{activity-grid.tsx, cell.tsx, build.ts}`. New livestore query `linkCreatedAts$` (no `deletedAt` filter — counts every link). Pure builders in `build.ts` (`buildCells` / `buildMonthLabels` / `buildDayLabels` + `formatTooltipText`); memoized `ActivityCell` with primitive props; padded outer wrapper gives 16×16 hitbox over a 14×14 visible square so quick mouse moves stay in-target. Single `Tooltip.Root` + many `Tooltip.Trigger`s via `Tooltip.createHandle()` — fixes the stuck-tooltip bug from rapid horizontal traversal that 182 per-cell Roots couldn't handle. Provider passes `closeDelay={150}` only (no open delay). `data-[instant]:animate-none` suppresses the swap animation between triggers; `pointer-events-none` is opt-in via new `positionerClassName` prop on `TooltipContent`. Mon-aligned rows (today's calendar week is the rightmost column; future days render as faint placeholders). Month labels filter via running-cursor min-gap rule (drops crowded followers, keeps first). 4-step warm-amber color scale on `--primary` (0 / 1–2 / 3–5 / 6+). Click does nothing in v1 — followup task logged for cell-click → list filter + multi-cell range select.
- **Phase 4 — Floating command chip (search-only scope)**: ✅ shipped (2026-04-23). Old `CommandDialog`-based search retired: `src/components/search-command.tsx` + `src/stores/search-store.ts` deleted. New `src/components/command-chip.tsx` is a persistent bottom-centered `<label>` pill (480px, `rounded-full`) that expands a panel upward on focus. Reuses existing `searchLinks$` + `recentlyOpenedLinks$` livestore queries; no new queries. ⌘K toggles; Esc / pointer-outside / Tab-away close; clicking the pill focuses the input via native label behavior. `AnimatePresence` on the panel with the project's standard spring (bounce 0, duration 0.22) + 80ms tween exit + reduced-motion opacity crossfade. `highlighted-text.tsx` default yellow swapped to `bg-primary/15 dark:bg-primary/25` — the match highlight is now the first place the warm-orange accent appears in this surface. Rows reduced to favicon + domain + title only; status dots/badges dropped (search is for finding, status lives in the detail view). Layered warm-tinted shadows `rgb(61 40 20 / …)` on both pill and panel (tight 1px contact + wider lift), warm-tinted border `border-primary/10` that tightens to `border-primary/25` on focus. Microcopy: `N matches` (tabular-nums, pluralized) / `Nothing matches "foo"` / `Type to search`. TopBar search button removed (chip is persistent so it's redundant). **Explicitly out of scope:** agent mode, mobile treatment, keyboard hints footer, query scoping (`domain:`, `tag:`), recent-query memory, ⌘↵ open-in-new-pane. The existing chat sheet is still mounted separately — not subsumed.
- **Phase 5**: shipping piecemeal — see [[#Remaining work]].
- **Multi-select temporarily disabled** (2026-04-22 evening): selection store / hotkey tracking / modifier-click handling / `SelectionToolbar` all unwired. Reason: selection-mode hotkey was re-rendering all 244 cards on every Cmd keypress. To be rebuilt in Phase 3b as the right-pane selection view. Dead code preserved (`selection-store.ts`, `selection-toolbar.tsx`) for resurrection.
- **Perf architecture decision (2026-04-22 late evening)**: pursued and rejected both `<Activity>` keep-alive and CSS `display:none` pre-rendering. Normal TanStack Router mount/unmount per route restored. Approach: keep the queries fast via composite indexes + keep the shell mounted (global work stays mounted across category switches). Accept the per-route mount cost (~77ms for 244 cards) as bounded by React's reconciliation floor. Indexes added on `links(status, deletedAt, createdAt)`, `links(deletedAt, createdAt)`, `links(status, deletedAt, completedAt)`, `links(deletedAt)`.
- **Phase 1 cleanup pass** (2026-04-22 overnight): deleted `app-sidebar.tsx`, `ui/sidebar.tsx`, and the `link-card/` barrel. Various small polish — inconsistent naming fixed, redundant allocations dropped, inline styles eliminated. 534/534 tests still pass.
- **Perf floor understood** (2026-04-22 overnight, Chrome DevTools profiling): at 241 links, SQL is fast (14ms total via composite indexes), React scheduling + GC dominates (~110ms combined). IVM shelved — not where the cost lives. Detailed findings in Open Questions below.
- **Agent UI scaffold (continuing phase 4)**: 🚧 in progress (2026-05-03). Floating chat surface in the bottom dock alongside search; morphing popup with horizontal slide between modes; mode/query state machine; single dismiss path; fake messages only — no backend wiring yet. See "Agent UI" section below for architecture decisions, status, and remaining work.
- **Listbox keyboard nav**: ✅ shipped (2026-04-29). Up/down + j/k move focus + selection through the list, detail pane updates as you go, Esc restores focus to the row that opened it. Roving tabindex with anchor ref + tabStop state. ARIA `listbox` / `option` semantics. Hover-blur clears the focus ring when the mouse takes over the cursor anchor. The `[` / `]` detail-view nav was removed (arrows replace it). Pure helpers extracted to `src/lib/listbox-keyboard.ts` (`findRowInContainer`, `focusRowById`, `clearKeyboardFocusFromOtherRow`, `computeTargetIndex`) with 30 unit tests under `src/lib/__tests__/listbox-keyboard.test.ts`. Held-key perf regression resolved by stable handler refs (see "Held-key keyboard nav perf" entry on the kanban Done column).

## Remaining work

Consolidated tail of the redesign — merges what was originally split between this section and "Phase 5 — Remaining small things". Each item owns its own sub-PR.

- ~~**Column-with-inner-scroll layout.**~~ shipped 2026-05-05 — outer shell flipped from page-scroll to per-column scroll; right pane is no longer sticky; left list wrapped in a `<ScrollArea>` with edge fade and lazy thumb. Header tightened, masthead title removed (see progress log).
- **Filtered-count rewire.** Count placement landed in the list-column header (page name + count, Linear-style — see progress log). The remaining work is to swap the count's data source from the per-status query (`inboxCount$` etc.) to the filtered list length, so it reflects the full filter chain (page × tags × future search). Today the column header still shows the unfiltered category total.
- **Tag-strip overflow as popover.** Replace the inline "+N more" expand with a `[+]` icon button that opens a popover listing all tags. Tag chips on the strip stay single-line, truncate to fit; `[+]` shows an overflow badge. Keeps the strip from wrapping and avoids the row growing on expand.
- **Dock focus lock.** Once the search/agent dock opens, focus should be trapped inside until it's dismissed. Today, Tab can move focus out of the dock while it stays visible, leaving the panel open with focus elsewhere. Bug repro: Tab through the page until focus lands on the search pill — blurring the input does not close the popup. Investigation needed: (a) wrap the dock in BaseUI's `Popover` / `Dialog` (inherits `FloatingFocusManager` via `@base-ui/react/floating-ui-react`, but requires reshaping the motion-driven panel around a `useFloatingRootContext`), or (b) add a small custom `useFocusTrap(rootRef, active)` hook that wraps Tab/Shift+Tab within the panel and captures `document.activeElement` on open to restore on dismiss. Either way, decide whether the dock should also block click-through to underlying content while open; today it doesn't.
- **Accessibility sweep** — `aria-label` on all icon-only buttons, `:focus-visible` throughout, reduced-motion compliance across the board. (Keyboard nav for list and activity grid is wired via the unified keyboard system; remaining work is everything else.)
- **Type scale pass** — 5 sizes with ≥1.25 ratio; pick a display weight for hero moments so the mono voice has internal contrast.
- **Dark mode pass** — apply the type / radius passes to the dark variant.
- **Tabular numerics audit** — every count / date / timestamp uses `font-variant-numeric: tabular-nums`.
- **shadcn radius pass** — switch the global shadcn config to rounded corners (bump `--radius` in `globals.css` / `components.json`) and re-install the affected primitives from the registry so components that bake in literal `rounded-none` / fixed-radius classes (button, input, dropdown, dialog, etc.) pick up the new value. Audit local overrides where we forced `rounded-none` and remove any that were compensating for the old default.
- ~~**Color token pass.**~~ obsolete — neutrals are fine as-is.
- ~~**Activity indicator** in the right-side header slot.~~ obsolete — superseded by the GitHub-style activity grid in `WeeklyDigest`.
- ~~**Settings / integrations slash-commands** in the chip.~~ obsolete — slash commands removed entirely.
- ~~**Grid view re-design.**~~ obsolete — grid view removed in phase 2.

Tracked in [[../kanban|kanban]] as standalone tasks (pulled out of this list):

- [[mobile-view-review|Mobile view review + fixes]]
- [[tag-text-colors|Per-tag text colors]]
- [[further-list-mount-perf|Further list-mount perf improvements]]
- [[agent-context-chips-entry-points|Agent context chips + entry points]]

## Implementation approach

Five phases, each a standalone chunk of work that can ship independently. Earlier phases are preparatory and reversible; later phases are where the redesigned experience actually lands.

**Guidance to the agent implementing each phase:**

The plan below is deliberately incomplete. Each phase lists specific decision points that were not discussed during design iteration. **Stop and ask the user rather than guess.** In the PR description for each phase, list (a) decisions you asked the user about and (b) small decisions you made without asking — this gives the user a chance to correct course.

Always read the current app's state of a feature before replacing it. The prototype is a direction, not a spec.

### Features to respect (must carry forward)

The prototype omits these features that the production app has today. The implementation must preserve them unless a phase explicitly replaces one:

- **Ingestion sources** beyond manual paste: Telegram bot, Raycast extension, iOS Shortcut, API, Chrome extension (planned). None of these UIs change.
- **Processing states** for in-flight links: pending, fetching, processing summary, error. Currently visualized via `BorderTrail` animation on the card.
- **Link actions**: mark complete / uncomplete, archive, restore from archive, delete, reprocess, copy URL, open external.
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

The phase 5 candidate-items list has been merged into [[#Remaining work]] above. Each remaining item still ships as its own sub-PR — phase 5 is deliberately not over-planned.

---

## Agent UI

The agent surface lives in the bottom dock alongside search, sharing one morphing popup. Search and agent are mutually-exclusive modes (`mode: "closed" | "search" | "agent"`); the popup never hosts both. The trigger row is a fixed-height anchor that doesn't move when modes change. Continues phase 4, which scoped to search-only.

### Architecture decisions

- **One DO per user, one chat thread per user.** Cloudflare's `AIChatAgent` (`@cloudflare/ai-chat`) is hard-coded to one conversation per DO — the `cf_ai_chat_agent_messages` table has no thread key, and `useAgentChat` connects 1:1 to a named instance. Cloudflare's official multi-chat pattern is sub-agents (one DO per thread), but each chat DO would need its own Livestore client — expensive enough to defer. Sub-agents stay as a phase-2 escape hatch with a parent-routing pattern: chat DOs go light, tool calls RPC into a parent that owns Livestore.
- **No "New chat" affordance.** Single thread is the model. Replaced with a Reset that clears messages (`CF_AGENT_CHAT_CLEAR`) and auto-summarization when the window grows (Session API `compact()`).
- **Tools already defined.** `cf-worker/chat-agent/tools.ts` is the existing tool surface — not redesigned.
- **Single morphing popup with lifted providers.** One `motion.div` morphs between modes (`right` 0 ↔ 48, `transformOrigin` "bottom right" / "bottom", opacity, scale). Search/agent contents swap inside via `AnimatePresence` with directional fade+slide keyed on `displayMode`. The three agent providers (`AgentConnectionProvider` → `AgentInputProvider` → Suspense → `AgentChatProvider`) live _above_ the morphing motion.div and stay mounted once `agentEverOpened` flips true. `AgentPanel` itself mounts/unmounts freely with mode swaps — chat state survives because the providers don't.
- **Trigger handlers own anchor + position.** `originMV: useMotionValue<string>` and `rightMV: useMotionValue<number>` live in `BottomDock`. `openAgent`/`openSearch` wrappers (used by Cmd+J, Cmd+K, AgentTrigger click, SearchTrigger focus) set both _before_ `setMode`. Closed→open snaps via `mv.set(...)` (synchronous Framer DOM update on next frame); open↔open animates `rightMV` via Framer's imperative `animate(mv, target, spring)`. Putting either in `animate` with `transition: { duration: 0 }` was unreliable — Framer leaked one frame at the old value before snapping.
- **`sessionRef` remounts inner content on closed→open.** Counter bumps on every closed→open. `ContentSwitcher` is keyed by it, so its `AnimatePresence` remounts fresh each time with `initial={false}` — the new mode's content appears in place, no "old mode briefly visible" flash on reopen.
- **Lazy chat connection.** `agentEverOpened` flag in `dock-store.ts` flips true on first agent open and never back. The provider stack mounts only after that flag flips. No fetch at app boot, no reconnect on subsequent opens.
- **Split providers, no bridge, no `useEffect` mirror.** `AgentConnectionProvider` calls `useAgent` (no suspension, exposes `agent.state.usage` and `isConnected` reactively); `AgentInputProvider` holds `draft` + `selectionRef` + `setupTextarea` (so they survive Suspense fallback ↔ resolved swap and mode-swap remounts); `AgentChatProvider` calls `useAgentChat` (suspends on initial fetch, exposes messages/sendMessage/etc). Each just provides React Context. No store, no `useEffect` mirror, no render-null bridge.
- **Suspense scoped to messages + send, not the whole panel.** Header sits outside the `<Suspense>` boundary (uses connection only — always live). Suspense fallback (`SkeletonAgentPanel`) renders skeleton messages + a real, typeable `<textarea>` with `canSend=false`. ~100-200ms initial load is non-blocking for typing; cursor + draft persist via `AgentInputProvider`.

### Status — single morphing dock with lifted providers (2026-05-04)

What's built end-to-end:

- `BottomDock` with chip + sparkle trigger in a 3-col grid (`1fr | auto | 1fr`); chip stays center-x.
- Single morphing motion.div (`MorphingPanel`): `right` (0 ↔ 48 via `rightMV`), `transformOrigin` ("bottom right" / "bottom" via `originMV`), opacity, scale. Reference visual pattern: `src/components/ui/navigation-menu.tsx`.
- Inner content swap: `ContentSwitcher` runs `AnimatePresence mode="popLayout"` keyed by `displayMode`. Enter uses `EASE_OUT` curve with 0.06s delay; exit uses `EASE_IN` 0.08s opacity + 0.18s spring x — tightened for snappier morphs.
- Trigger handlers (`openAgent`/`openSearch`) own the anchor: set `originMV` and `rightMV` _before_ `setMode`. Closed→open snaps; open↔open uses imperative `animate(rightMV, target, spring)` for the slide.
- `displayMode` (state) tracks the last open mode — kept stable through close so the panel shows the right content fading out. Bumps a `sessionRef` on every closed→open so `ContentSwitcher` remounts and `AnimatePresence` doesn't run a stale swap.
- State machine (`dock-store.ts`): `mode`, `query`, `agentEverOpened`, `setMode`, `setQuery`, `close`. Transitions atomically clear `query` when leaving search and flip `agentEverOpened` on first agent visit.
- Single dismiss path: `useDismiss(rootRef, dismiss, active)` covers Esc + outside-click; `dismiss` blurs focused element + `close()`.
- ⌘J toggles agent. ⌘K opens search. AgentTrigger and SearchTrigger receive `active: boolean` from parent (no separate store subscription); SearchTrigger takes `onActivate` prop.
- Compact agent chrome: `h-7` header, `p-1` form, `text-xs` body, `icon-xs` send button. Sparkle trigger has press feedback (`scale: 0.96`).
- Backend wired: real messages stream from `ChatAgentDO` via `useAgentChat`. Tool calls render via existing `ChatMessage`. Connection dot + monthly `UsageIndicator` in header. All state flows through `useAgentConnection()` / `useAgentChat()` / `useAgentInput()` context hooks.
- Loading state: `SkeletonAgentPanel` Suspense fallback (skeleton messages + typeable `<textarea>` via `useAgentInput` context). Header live throughout. Cursor + draft survive Suspense resolution and mode-swap remounts.
- Lexical editor + slash commands removed entirely. Plain `<textarea>` with Enter-to-send, Shift+Enter newline. ⌘K/⌘J pass through.
- `cmdk` decoupled from layout via `className="contents"` — provides input/list context only.
- Files: `src/components/agent/{agent-chat-provider,agent-panel,agent-header,agent-messages,agent-input,agent-skeleton}.tsx`, `src/components/bottom-dock/{bottom-dock,morphing-panel,search-trigger,search-content,agent-trigger,result-row}.tsx`, `src/stores/dock-store.ts`, `src/components/chat/chat-container-context.ts`.

SDK versions: `@cloudflare/ai-chat` 0.6.2, `agents` 0.12.3, `@ai-sdk/react` 3.0.176, `ai` 6.0.174.

Old chat sheet code partially removed: `chat-sheet.tsx`, `chat-content/index.tsx`, `chat-loading.tsx`, `chat/lexical/`, `shared/slash-commands.ts` deleted. `ChatContainerContext` extracted. `ChatSheetProvider` + `chat-context.tsx` still mounted because `dots-menu.tsx` uses `useChatPanel` — full removal pending in "Drop chat sheet entirely" item below.

### Remaining work

All Agent UI work that was blocking the redesign has shipped. Remaining follow-ups were moved to the kanban backlog as standalone tasks (see [[../kanban|kanban]]):

- Agent context chips + entry points (combined task — value validation needed before building)
- Mobile view review + fixes (full-app pass; agent dock is one of the offenders)

Phase-2 escape hatch (sub-agent migration) is dropped — single-thread design is settled.

Done in-phase, kept here for history:

- ~~**Reset / Clear conversation.**~~ ✅ done. Lives inside the usage-indicator preview-card popup in the agent header — hover the progress ring, popup shows monthly usage + a "Clear conversation" button. Uses `clearHistory()` from `useAgentChat`. No modal.
- ~~**Tool call rendering.**~~ ✅ already shipped via `src/components/ui/tool.tsx` — handles `input-streaming` / `input-available` (with confirm/reject) / `output-available` / `output-error`, expandable args/results. Inherited by the new agent panel via `agent-messages.tsx`.
- ~~**Empty state.**~~ skipped — current empty state is fine.
- ~~**Scroll-to-bottom by default + preserve position across mode swaps.**~~ ✅ done.
- ~~**Drop chat sheet entirely.**~~ ✅ done. Deleted `chat-sheet-provider.tsx` and `chat-context.tsx` (chat-sheet.tsx was already gone), dropped `ChatSheetProvider` from `_authed.tsx`, migrated `dots-menu.tsx` to `useDockStore.getState().setMode("agent")`.
- ~~**Accessibility.**~~ skipped — revisit if a real need surfaces. Original ask (`role="dialog"` + `aria-modal`, focus trap, `:focus-visible` polish) wasn't validated against actual usage.

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

### 2026-05-05 — unified keyboard system, header alignment, activity tweaks

**Hotkey listbox-row bug** (committed `984caeb`). `react-hotkeys-hook`'s built-in form-tag detection treats ARIA `role="option"` as a form element. `LinkList` rows are `<button role="option">`, so after clicking a row, focus stayed on the button and the dock's `cmd+K` / `cmd+J` / `Esc` hotkeys were suppressed (their `enableOnFormTags` had `["input", "textarea"]` — no "option"). Existing list-nav hotkeys already included `"option"`; just propagated the same fix to dock hotkeys.

**Activity grid keyboard nav** (already committed earlier as `473b8fc`). Roving tabindex on a column-major calendar grid: one cell at a time has `tabIndex=0`, arrows move the active cell (←/→ ±7 for week, ↑/↓ ±1 within column, no wrap), `data-cell-idx` for direct DOM lookup, focus syncs to `activeIdx` via container `onFocus`. Initial active cell is "today" (last non-future). Future cells are non-focusable.

**Keyboard system unified — `src/lib/keyboard.ts`.** Built manifest + pure resolver + thin hooks, then iterated to a stripped-down version after a hostile review found over-engineering. Final shape (one file, ~75 lines, no comments):

- Two const maps as data: `COMMANDS` (id → `{ keys, scope }`) and `NAV` (id → `{ keys }`).
- One pure function `topmostScope(active: readonly string[]): Scope | null` walking `ESC_PRECEDENCE = [global, detail, selection, dock, dialog, popover]` — the only piece of logic worth testing in isolation.
- Three hooks: `useCommand(id, handler, enabled?)`, `useDismiss(scope, handler, enabled?)`, `useNavigation<T>(id, handler)` — each ~10 lines, no internal branching.
- `enableOnFormTags: ["input", "textarea", "option"]` baked in (so no one forgets `"option"` again).

`useDismiss` doesn't pass `scopes` to `useHotkeys`; it gates via `enabled: topmostScope(activeScopes) === scope`, which makes Esc precedence a single resolver call. `useCommand` does pass `scopes: [shortcut.scope]` so the lib's existing scope filter handles command gating.

Migrations: every call site converted (`bottom-dock`, `detail-view`, `bulk-action-header`, `per-link-header`, `add-link-dialog`, `link-list`, `activity-grid`). Deleted `src/components/ui/hotkey-button.tsx` and `src/components/right-pane/headers/bulk/use-selection-hotkeys.ts` — both became no-ops over the new hooks.

**Dock scope** (Esc-precedence fix). Bug: dock open over an active link → Esc closed the link, not the dock. Added `dock` scope between `selection` and `dialog` in the precedence ladder. Bottom-dock now does `useHotkeyScope("dock", { enabled: mode !== "closed" })` and `useDismiss("dock", dismiss)`. Dialog/popover still beat dock (modal layers above floating).

**Tests.** `src/lib/__tests__/keyboard.test.ts` — 8 cases covering the precedence ladder + edge cases (empty, unknown scope). 597 tests pass.

**Header alignment.** After the column-header (Masthead inside list column) shipped, audited all four header surfaces — Masthead, per-link slot, bulk slot, Activity heading — and found four different text sizes, three different color tokens, inverted top/bottom padding, mix of baseline vs center alignment. User chose right-pane headers as the typography baseline (already looked good; everything else adapts). Final shared contract:

- Vertical padding `pt-3 pb-2` everywhere.
- Title primary text `text-sm font-semibold text-foreground` (Masthead only — no analogue in the right-pane slot).
- Counter / secondary text `text-xs text-muted-foreground tabular-nums`.
- `items-baseline gap-2` for primary+secondary pairs.
- `bulk-action-header` keeps `text-primary` orange — that's the active-selection-mode tell.

Files: `masthead.tsx` (padding flipped, count down to `text-xs`), `activity-grid.tsx` (heading wrapped in `pt-3 pb-2` shell), `right-pane.tsx` (dropped `pt-4` from the activity wrapper since the heading owns its top padding now).

**Activity-grid tweaks.** Removed `px-2` from heading (now flush-left like the grid). Day labels (Mon / Wed / Fri) moved to the right side: grid template flipped to `repeat(${WEEKS}, 16px) auto`; cell `gridColumn` decremented by 1; day-label column = `WEEKS + 1` with `pl-1` for the leading gap.

**Remaining-work doc updated.** Removed "Recent-query memory" (misunderstanding — only the link-recents were wanted, already shipped). Renamed "Filtered-count placement" → "Filtered-count rewire" (placement decided; data source still uses per-status query, needs wiring to filtered list length). Added "Tag-strip overflow as popover". Added "`#tag` search syntax" to the kanban Todo.

**Next ideas (not yet captured as items).** During this session the user mentioned (a) considering the dock as a real bottom bar (not floating) plus wrapping the 2-pane work area in a bordered card — sketched I/II/III; deferred. (b) The column-with-inner-scroll layout is shipped, but the bordered-card framing is the open variation. Both worth re-opening before a polish pass.

### 2026-05-05 — column scroll layout, edge-faded ScrollArea, masthead title retired

**Outer shell flipped from page-scroll to per-column scroll.** Page was `h-svh overflow-auto` with the right pane `sticky top-0 h-svh self-start` to pin while everything scrolled behind it. New shape: `h-svh overflow-hidden` outer + `flex h-full flex-col` inner; the bottom grid is `flex-1 min-h-0` and each column owns its own scroll. Right pane drops `sticky` + `self-start`, becomes a regular grid cell (`flex h-full min-h-0 flex-col`) — it can never extend past the viewport bottom because the grid cell can't. Top region tightened: `pt-16 pb-24` → `pt-6 pb-6`, `mt-14` → `mt-6`. Left list column wrapped in `<ScrollArea>` (was raw `overflow-y-auto`) for parity with the right pane.

**ScrollArea polish.** Three additions to `src/components/ui/scroll-area.tsx`:

- **Reserved gutter.** `pr-3` on Viewport so list cards never sit underneath the absolutely-positioned thumb. The Scrollbar is `w-1.5` (6px); a 12px reservation gives a 6px gap.
- **Lazy thumb.** Defaults to `opacity-0`, fades in only when the Scrollbar has `data-hovering` or `data-scrolling` (driven via `group-data-*`). The thumb is mostly absent when stationary, so the JS lag (see below) is mostly invisible.
- **Edge fade.** Two CSS vars (`--fade-y-start`, `--fade-y-end`) default to `0px` and flip to `1.5rem` when base-ui sets `data-overflow-y-start` / `data-overflow-y-end` on the Viewport. `mask-image: linear-gradient(to bottom, transparent 0, black var(--fade-y-start), black calc(100% - var(--fade-y-end)), transparent 100%)`. At the top of scroll only the bottom fades; mid-scroll both fade; at the end only the top fades. Pure CSS, no JS in the path.

**Negative-margin clip fix.** Link list rows use `-mx-3 w-[calc(100%+1.5rem)]` to bleed hover/active backgrounds past the row's content edge. With per-column scroll the column has `overflow: auto` on one axis, which (per CSS spec) coerces the other axis to `auto` too — the bleed got clipped. Fix: `px-3` on the wrapper inside the Viewport so the row's `-mx-3` lands flush at the column's clipping edge, preserving the existing visual.

**Custom scrollbar lag — known and accepted.** The base-ui thumb tracks scroll position via JS (`onScroll` on the Viewport → imperative `thumb.style.transform = translate3d(0, offset, 0)`). Browsers paint the new scroll position before firing the JS event, so the thumb is structurally one frame behind a native compositor-thread scrollbar — true of every JS-driven scrollbar (radix, base-ui, react-custom-scrollbars, etc.). Discussed swapping to native `overflow-y-auto` with webkit `::-webkit-scrollbar` + Firefox `scrollbar-width/color` (zero lag) but kept base-ui because we wanted the edge fade and themed thumb. The lazy-thumb behaviour above means the lag only surfaces during an active drag of the thumb itself — rare enough to live with.

**Header compaction — masthead title removed.** The 52px `h1` in the masthead duplicated `CategoryNav`'s active-tab signal: which page you're on is already conveyed by which tab is highlighted. Removed the `h1` entirely. `Masthead` is now a count-only component (`{count} {noun}`); kept the file rather than deleting because the count's plumbing (`usePageStaticData`, per-status query map) is still useful. The masthead row's empty 540px right slot (an `<aside aria-hidden>`) is gone. New shape: `[count] [tag strip]` on one `flex items-baseline gap-6` row between `TopBar` and the divider. Net: one full row removed from the header.

**Count placement — landed in list-column header (option C).** Considered three placements: (A) number on the active `CategoryNav` item, (B) count flush-right on the tag-strip row, (C) inside the list column itself. Initial lean was B for cause/effect adjacency, but the user pushed back: with the list column on the _left_ and the count on the right side of a strip above, the count drifts away from the thing it counts. A was rejected because it announces the count _before_ the secondary (tag) filter has been read, inverting the hierarchy. C was the only placement where the count sits where it belongs and follows the full filter chain in reading order: page (TopBar) → tags (above divider) → result (column header).

Sub-agent research confirmed Linear, Height, Mail/Notes all use a column-name + small muted count pattern at the top of a scrolling column. Pattern adopted: `<Masthead />` rendered _outside_ the `<ScrollArea>` at the top of a `flex flex-col min-h-0` left-column wrapper. Header is title (`text-sm font-semibold text-foreground`) + count (`text-[13px] text-muted-foreground tabular-nums`) on a baseline-aligned row. The list scrolls underneath; the existing top-edge fade on the ScrollArea handles the visual transition between header and scrolling content — no divider line needed. Tag-strip stays in its current full-width position above the divider; not moved into the column.

Count source still uses the per-status query (`inboxCount$` etc.), so it doesn't yet reflect the active tag filter. The data-source rewire is captured under "Filtered-count rewire" in [[#Remaining work]].

**Tag overflow + `#tag` search.** Two follow-ups added: (1) tag-strip overflow → `[+]` icon popover (no inline +N expand, no row wrapping), captured in remaining work; (2) `#tag` search syntax in the bottom-dock search panel — typing `#` should suggest tags and filter by them, captured in [[../kanban|kanban]] under Todo.

**Files changed.** `src/routes/_authed.tsx`, `src/components/right-pane/right-pane.tsx`, `src/components/ui/scroll-area.tsx`, `src/components/masthead.tsx`, `src/components/category-nav.tsx`.

### 2026-05-04 — single morphing dock restored, motion values for origin + position

Reverted the "two independent popups" architecture from the previous session in favor of one morphing motion.div, matching the navigation-menu pattern (`src/components/ui/navigation-menu.tsx`) the user pointed at. The previous session's split was a workaround for "agent panel must stay mounted to keep chat alive" — solved correctly this time by lifting the providers above the morphing motion.div instead.

**Single morphing motion.div in a new `MorphingPanel` component.** One motion.div animates `right`, `transformOrigin`, `opacity`, `scale` between search (right:48, "bottom") and agent (right:0, "bottom right"). Width stays static (480px) — animating width caused message lines to re-wrap mid-morph.

**Trigger handlers own the anchor.** `originMV: useMotionValue<string>` and `rightMV: useMotionValue<number>` in `BottomDock`. `openAgent`/`openSearch` wrappers set both _before_ `setMode`. Closed→open uses `mv.set(...)` for an instant snap (Framer applies the value to DOM on the next animation frame, before the open animation tick); open↔open uses Framer's imperative `animate(rightMV, target, spring)` for the slide. Earlier attempt with `transition: { duration: 0 }` on the `right`/`transformOrigin` keys in the `animate` prop didn't actually snap — there was a one-frame delay where the panel rendered at the previous mode's anchor before correcting, and the user could see it.

**`sessionRef` for inner content remount.** Counter bumped on every closed→open. `ContentSwitcher` is keyed by it, so its `AnimatePresence` remounts fresh on reopen — `initial={false}` makes the new content appear in place. Without this, reopening to a different mode after a close would briefly show the old mode's content cross-fading with the new (because the inner AnimatePresence's previous swap was still mid-flight).

**Lifted draft + selection.** `AgentInputProvider` (above Suspense, above the motion.div) holds `draft`, `selectionRef`, `setupTextarea`. The textarea's value, cursor position, and focus survive the Suspense fallback ↔ resolved tree swap and the mode-swap remount. `setupTextarea` is a `useCallback`-stable callback ref that, on textarea mount, restores `setSelectionRange` from `selectionRef.current` and calls `focus()`.

**Curve tweaks.** Inner content swap: `EASE_OUT [0.22, 1, 0.36, 1]` for enter (smooth, navigation-menu-style), `EASE_IN [0.4, 0, 1, 1]` for exit (front-loaded, fast initial drop). Exit timings: opacity 0.08s, x-spring 0.18s — old content gets out of the way faster on a morph. Enter has a 0.06s opacity delay so old visually clears before new appears.

**Trigger paths consolidated.** All four open paths (Cmd+J, Cmd+K, AgentTrigger click, SearchTrigger focus) route through `openAgent` or `openSearch`. `SearchTrigger` no longer mutates the dock store directly — takes `onActivate` prop. Both triggers receive `active: boolean` from `BottomDock` instead of subscribing to `useDockStore` themselves (three subscriptions reduced to one).

**Cleanups (post-review by general-purpose subagent).** Unused `toggle` action removed from `dock-store.ts` (was orphaned after the split-popup refactor). Trigger components stopped subscribing to `useDockStore` for `active`. The subagent also recommended deriving `displayMode` from `mode` directly — applied, then reverted: derivation flipped `displayMode` to "search" the moment `mode` went to "closed", which made search content slide in during the close-from-agent animation. Kept as `useState` that only updates when `mode` is "search" or "agent".

**Files changed.** New: `src/components/bottom-dock/morphing-panel.tsx`. Modified: `src/components/bottom-dock/{bottom-dock,agent-trigger,search-trigger}.tsx`, `src/components/agent/{agent-chat-provider,agent-panel,agent-input}.tsx`, `src/stores/dock-store.ts`.

**Verification.** Typecheck + lint clean. Browser-verified by user across closed→open, search→agent morph, agent→close→search reopen, agent→close→agent reopen. Two scenarios where the wrong-origin or wrong-position bug surfaced before the motion-value approach were re-tested and confirmed fixed.

### 2026-05-03 — agent backend wired, providers split, panel made persistent

Continues from the morphing-dock scaffold landed earlier today. Three threads of work this session: backend wiring, SDK bumps, and an architecture refactor away from the bridge-and-store pattern toward straight React Context.

**Backend wired.** Fake messages replaced with the real chat. `useAgent` opens the websocket; `useAgentChat` (default `getInitialMessages`, fetches from `/agents/chat/<orgId>/get-messages`) supplies messages, sendMessage, status, error, addToolOutput. Tool calls render via the existing `ChatMessage` + `Tool` components. Header gets the live connection dot and monthly `UsageIndicator` (reading `agent.state?.usage` directly — `agents` 0.8.0+ exposes reactive state). Send button gates on `canSend = isConnected && !isStreaming && !hasPendingConfirmation`; textarea itself is never disabled, so users can compose during streaming and send when ready.

**SDK bumps.** `@cloudflare/ai-chat` 0.1.9 → 0.6.2, `agents` 0.7.9 → 0.12.3, `@ai-sdk/react` 3.0.136 → 3.0.176, `ai` 6.0.134 → 6.0.174. Zero code changes required for compatibility (a subagent verified by reading each changelog and running typecheck + lint + 585 unit tests). DO SQLite migrations apply automatically on first request after deploy — no manual `db:migrate:local` or Wrangler tag bump.

**Lexical editor + slash commands removed.** The lexical-based chat input was eating ⌘K (its contenteditable doesn't match `enableOnFormTags: ["input", "textarea"]`). Swapped to a plain `<textarea>` — Enter to send, Shift+Enter newline, IME composition respected. Slash commands fully removed (`@/shared/slash-commands.ts`, `chat/lexical/`, all the typeahead plumbing). `/help` and `/clear` will be reintroduced as proper UI controls when needed.

**Architecture refactor: bridge → context.** First wiring used a "bridge" component that called `useWorkspaceChat` and `useEffect`-mirrored its return value into a Zustand store. Two complaints surfaced: (a) the render-null component felt off, and (b) `useEffect` for state sync is the kind of thing we want to avoid. After the SDK bump, switched to a Cloudflare-blessed pattern (verified against `cloudflare/agents` examples `ai-chat`, `workspace-chat`, `multi-ai-chat`):

- `AgentConnectionProvider` calls `useAgent` (no suspension), provides connection + usage via Context.
- `AgentChatProvider` calls `useAgentChat` (suspends on initial fetch), provides messages/sendMessage/etc via Context.
- No store, no `useEffect` mirror, no bridge.

Suspense placement: connection and header live outside Suspense, messages + input live inside. The fallback renders skeleton messages and the _same_ `<InputForm>` component the real input uses, with `canSend=false` and a no-op submit. `draft` state is lifted into `AgentPanel` so the textarea content survives the fallback → real swap on Suspense resolution. Net effect: ~100-200ms initial load shows skeleton messages, but the input is fully typeable throughout.

**Persistent agent panel.** With the chat hooks living inside the panel via Context, the panel must stay mounted to keep the websocket alive. Refactored `BottomDock`: search and agent are now independent popups. Search uses `AnimatePresence` (mount/unmount on `mode === "search"`); agent renders persistently after `agentEverOpened` flips, with manual opacity/scale animation tied to mode. Trade-off: the morphing-slide animation between the two modes is gone — now they cross-fade at their respective anchor positions. Cleaner architecturally; visual continuity is mildly worse but acceptable.

**`agentEverOpened` flag.** New field in `dock-store.ts`. `setMode`/`toggle` flip it true on first agent visit and never back. The agent popup's outer container is gated on this flag, so the chat hooks only mount once the user explicitly opens the agent — no fetch at app boot.

**Files changed.** Created: `src/components/agent/{agent-chat-provider,agent-skeleton}.tsx`, `src/components/chat/chat-container-context.ts`. Renamed/restructured: `bottom-dock/agent-content.tsx` → `agent/{agent-panel,agent-header,agent-messages,agent-input}.tsx`. Deleted: `agent-chat-store.ts`, `use-workspace-chat.ts`, `chat/lexical/`, `chat/chat-content/index.tsx`, `chat/chat-loading.tsx`, `chat/chat-sheet.tsx`, `shared/slash-commands.ts`. Updated: `bottom-dock.tsx` (split popups), `_authed.tsx` (removed standalone `<AgentChatProvider />`), `dock-store.ts` (added `agentEverOpened`).

**Verification.** `bun run typecheck`, `bun run check` (oxlint + oxfmt + Effect diagnostics) clean throughout. Browser smoke not yet done — first thing to verify when the session resumes.

### 2026-05-03 — agent UI scaffold lands as the morphing dock

Continues what phase 4 deferred. The chip is no longer the only surface in the bottom dock — a sparkle trigger sits next to it and toggles an agent panel that shares the same popup container. No backend wiring yet; this is the surface and the state machine.

**Surface.** `BottomDock` mounts in `_authed.tsx`. Chip + sparkle trigger in a 3-col grid (`1fr | auto | 1fr`) — chip stays center-x, sparkle hangs at the right column with `justify-self-start pl-2`. A single floating popup lives above the trigger column at `bottom-full mb-2 right-{12,0} w-[480px] h-[480px]`. Width and height stay fixed across modes; only `right` morphs (48 ↔ 0) so the popup slides horizontally between two anchors instead of resizing. The trigger row is a fixed-height anchor — opening either mode never moves the chip or sparkle.

**Animation.** Outer popup: scale 0.95 → 1 + opacity (0.22s spring entry, 0.16s exit, `bounce: 0`). `transform-origin` per mode: `bottom` for search, `bottom right` for agent — entry/exit anchors to where the trigger lives. Inner content swap on mode change uses `AnimatePresence mode="popLayout"` with content positioned `absolute inset-0`: 24px x-translate + opacity, direction = "right" when target is agent, "left" when search. No height animation — modes share a fixed 480px frame.

**State machine in the store.** `dock-store.ts` owns `mode` and `query`. Each transition (`setMode`/`toggle`/`close`) atomically clears `query` when leaving search, eliminating the state-sync `useEffect` that did this passively. The single imperative side — blurring whatever's focused inside the dock when dismissing — lives in a small `dismiss` helper that every close path routes through (Esc, outside click, ⌘K close-from-search, search-result select, agent close button).

**`useDismiss(rootRef, dismiss, active)`** consolidates Esc + outside-click into one hook. Replaced three independent close paths (standalone `useHotkeys` for Esc, an inline `mousedown` effect, and the search input's `onBlur`).

**`SearchTrigger` slim API.** Three props: `inputRef`, `value`, `onValueChange`. Reads `mode === "search"` from the store directly for active styling; calls `setMode("search")` on input focus. Dropped `onFocus`/`onBlur`/`active` props (6 → 3 + reading instead of receiving the rest).

**cmdk decoupled from layout.** `CommandPrimitive` is `className="contents"` — only provides input/list context. The grid lives on a separate `<div>`. Removes the previous coupling where cmdk's root was the layout container.

**Auto-focus without `useEffect`.** Agent textarea uses `autoFocus`. The component remounts every time mode becomes "agent" (because the swap unmounts the previous content), so `autoFocus` fires consistently.

**Visual polish.** Agent header trimmed to `h-7` with 12px sparkle, 12px close X, `text-xs` title. Form trimmed to `p-1 gap-1`, `text-xs` textarea, icon-xs send button. Press feedback (`scale: 0.96`) on the sparkle trigger. 22 fake messages render as alternating user/assistant bubbles inside `agent-content.tsx` for visual feedback.

**Old chat sheet temporarily disabled.** `<ContextualChatSheet>` and its imports commented out in `_authed.tsx`. `ChatSheetProvider` stays mounted because `dots-menu.tsx` still uses `useChatPanel`. Will be removed once the new panel is wired up.

**Doc shifted.** "Phase 4 agent mode" and "Chat sheet removal" bullets pulled out of the consolidated "Remaining work" list and into a dedicated `## Agent UI` section that tracks: architecture decisions (one DO per user; sub-agents deferred; no New chat), status, and remaining requirements (backend wiring, deniable context chips, multiple entry points, reset/clear, auto-summarization, tool call rendering, empty state, mobile, reduced motion, a11y).

**Verification:** typecheck clean, `vp check` (oxlint + oxfmt) + Effect diagnostics clean.

### 2026-05-02 — layout collapsed to one component, route-driven query, untagged dropped, nuqs out

**Layout simplified to a single component, query purely route-driven.** `LinksPageLayout` is now ~12 lines: reads its own match's `staticData` via `useMatch({ strict: false })`, runs one `useFilteredLinks(status)` subscription, renders the list. No props, no `useEffect`, no filtered/unfiltered split (the prior two-component dance existed only to gate `useFilteredLinksOnly` on `hasFilters`). Each of the four route files shrinks to `createFileRoute(...)({ component: LinksPageLayout, staticData: { icon, title, status, emptyMessage } })` — five lines, no query call, no wrapper component. Type-augmented `StaticDataRouteOption` in `main.tsx` with `status?: LinkStatus`, `emptyMessage?: string`, `title?: string`, `icon?: string` so the new fields are typed everywhere.

**`PageActionsContext` deleted.** It existed so `LinksPageLayout` could publish `{links, title}` upward via `useEffect` for `DotsMenu` and `BulkActionHeader` to read. Inverted to data-down via route metadata: `DotsMenu` reads the leaf `staticData` via `useMatches({ select })` (narrowed subscription — re-renders only when the leaf changes). `BulkActionHeader` no longer subscribes to a page list at all; its `alreadyCompleted` dedupe is a one-shot `store.query(linksByIds$([...selectedIds]))` inside `handleComplete`. `ExportDialog`'s API changed from `links: readonly LinkListItem[]` to `ids: readonly string[]` and it runs its own `linksByIds$` subscription only while `open` — cold path. `DotsMenu`'s page-export path mounts an `ExportPageDialog` wrapper that calls `useFilteredLinks(status)` only when the dialog is open. Net effect: one livestore subscription on the hot path (the layout's), opt-in subscriptions when the export dialog mounts.

**`useFilteredLinks` honest about undefined status.** Takes `LinkStatus | undefined`; when undefined, `filteredLinks$` returns a stable `WHERE 0` `emptyLinks$` query handle. No `as LinkStatus` cast at the call site — `staticData.status` flows through the type as it really is. The four base queries (`inboxLinks$`/`completedLinks$`/`archiveLinks$`/`allLinks$`) stay only because the cf-worker chat agent + tests still reference them; the React tree uses `filteredLinks$` exclusively.

**`untagged` filter option removed entirely.** The "untagged" toggle pill in `TagStrip` was rarely useful and added code in many places. Dropped: the parser in `useTagFilter`, the `setUntagged` setter, the `untagged` field in `TagFilterOptions`, the `untagged` SQL branch in `buildTagFilterClause`, the standalone `untaggedLinks$` query, and the `untaggedCount$` count query — plus their tests. `useTagFilter` is now read-only (`{ tag }`).

**Tag pills are real `<Link>`s, not `<button>`s.** Filtering by tag IS navigation — it changes the URL — so `<Link to="." search={(prev) => ({ ...prev, tag: active ? undefined : tag.id })} onClick={clearSelection}>` is the honest shape. Cmd-click / right-click / middle-click open in new tab, `cursor-pointer` is native, the URL is bookmarkable. The `less` toggle was removed (once expanded, the strip stays expanded for the page lifetime); `+N more` stays a `<button>` (UI state toggle, no `cursor-pointer` added).

**`nuqs` uninstalled, replaced with TanStack Router native search params.** Symptom that surfaced this: clicking a tag `<Link>` updated the URL but neither active-tag styling nor the filtered list re-rendered. Cause: nuqs's React adapter didn't see TanStack Router's navigation events. Fix: `validateSearch` declared on `_authed` (`tag?: string`); `useTagFilter` reads via `useSearch({ from: "/_authed" })`. One package gone, one less integration seam, every tag click now flows through the router.

**Category nav resets search params.** `CategoryNav` `<Link>`s pass `search={{ tag: undefined }}` instead of `search={(prev) => prev}`, so navigating Inbox / All / Completed / Archive clears any active tag filter — matches "category change = fresh context".

**`PerfHUD` retired.** The custom dev HUD (FPS / longtask counter / `<Profiler>` commit log mounted in `_authed.tsx`) was scaffolding from phase 2. Replaced by `@overengineering/fps-meter` mounted in `_authed.tsx` behind `import.meta.env.DEV`. `src/components/perf-hud.tsx` and all `<PerfProfiler>` wrappers (`LinksPageLayout`, `RightPane`) deleted.

**Per-link header export** uses `ids={[link.id]}` against the new `ExportDialog` API.

**Verification:** typecheck clean, `vp check` (oxlint + oxfmt) + Effect diagnostics clean, 577/577 tests pass (down from 583 — six tests removed alongside `untaggedLinks$` / `untaggedCount$`).

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
