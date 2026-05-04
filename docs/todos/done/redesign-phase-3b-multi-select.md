# Redesign phase 3b — multi-select

## Selection model

- Cmd-click toggles a row in/out of the selection
- Shift-click extends a range from the anchor (falls back to a single toggle if no anchor exists)
- Plain click keeps the selection — clears only on `×`, `Esc`, or route change (mount-time clear in `LinksPageLayout`)
- `removeStale` runs on link-set change

## Right-pane header architecture

Single decision point in `right-pane-header.tsx`: renders `BulkActionHeader` (always mounted for hotkey continuity) plus `PerLinkHeader` keyed on `activeLinkId` in an `AnimatePresence`. Both fade with `opacity` + `filter: blur(4px) ↔ blur(0px)` over 120ms.

`PerLinkHeader` is a self-contained sibling — owns its own `linkById$` / `linkProcessingStatus$` queries and Complete / Uncomplete / Delete / Restore / Reprocess / Copy / Export handlers.

`DetailView` body is header-less (just hero, meta, title, description, hairline, summary, tags, Esc hint) — no portals, no slot context, no body-level animation (just instant show/hide). Slot height animates `0 ↔ 48` (120ms ease-out) on `slotActive = !!activeLinkId || hasSelection` — this is the only "pop" motion that survived.

Bulk renders on top of per-link via `z-30 bg-background` so the swap is shift-free; both headers share `h-7` buttons + `pt-3 pb-2` for identical height. `BorderTrail` removed from `DetailView` (processing state still visible via `DetailSummary`'s shimmer).

## Bulk action cluster

- Route-aware `Complete` / `Reopen` (`/completed` → reopen)
- `Archive` / `Restore` (`/archive` → restore)
- Add-only tag picker (dedups via `tagsByLink$`)
- Export (reuses `ExportDialog` filtered against `PageActionsContext.exportAction.links`)
- `Clear`

Count is `text-primary font-semibold`. Hotkeys under `selection` scope (`⌘↵`, `⌘⌫`, `⌘E`, `Esc`) gated on `count > 0`; detail's `⌘↵` and `Esc` gated on `!hasSelection`. Single-link header gained `↓ Export`.

Old `selection-toolbar.tsx` deleted (resolves the `CommandChip` z-50 collision). Bulk-header layout: `×` Clear sits on the left next to the count (co-located with what matters); action cluster (Complete / Archive / Tag / Export) on the right.

## Initial selected-row visual (later replaced)

Selected rows got a 1.5px primary inset shadow ring (`shadow-[inset_0_0_0_1.5px_var(--primary)]`), fed by a per-id zustand selector hook (`useIsSelected`) so toggling one row didn't re-render siblings (the perf trap from the disabled-2026-04-22 attempt).

## Perf pass

- `RightPaneContext` split into `useRightPaneState` / `useRightPaneActions` so action-only callers (`CommandChip`, `AddLinkDialog`, `link-mention`, `DetailView`) skip the cascade on `activeLinkId` change
- `WeeklyDigest` and `ActivityGrid` are `memo`'d and stay mounted across detail open/close (was previously remounting 180+ tooltip cells per close)
- `DetailSummary` is `memo`'d with `useCallback(handleReprocess)`
- `ExportDialog` instances lazy-mount (`{exportOpen && ...}`) in `PerLinkHeader`, `BulkActionHeader`, and `WeeklyDigest`
- `useDeferredValue(linkId)` added in `PerLinkHeader` so held-arrow nav doesn't fire fresh livestore queries per keystroke

13 new unit tests under `src/lib/__tests__/selection.test.ts`.

## Post-3b iteration: checkbox-slot system

The inset-ring selected state was replaced by a checkbox-slot system. Listbox container gets `data-selection-mode` (count > 0) and `data-modifier-held` (⌘ / ⇧ via a window keydown / keyup / blur listener, `hasAttribute` guard so DOM only mutates on edge transitions).

Each row's slot is `display: none` by default and `block` when either attribute is present; content is a primary-filled circle + `<CheckIcon>` when `isSelected`, otherwise a `<CircleIcon>` cross-faded with a grayscale-filled-circle preview check on `group-data-[modifier-held]/list:group-hover` (instant, no transition).

Active row simplified to `bg-muted` only — no bar, no orange fill. The hover-ring discoverability follow-up is supplanted by this slot system.

`useInSelectionMode` boolean selector added to `selection-store.ts` and adopted by `LinkList`, `RightPane`, `PerLinkHeader`, `DetailView` — replaces `useSelectionCount() > 0` so those four only re-render at the 0↔≥1 threshold rather than every toggle.

`removeStale` now clears `anchorIndex` when the selection wipes (`selectedIds.size === 0`), preventing phantom-anchor shift-clicks after a route filter or deletion (3 new tests under `selection.test.ts`, total 580).

## Export-modal polish

- `Markdown` component gained styled `h1` / `h2` / `h3` / `hr` / `p` overrides (visible globally — applies to detail summary and chat too)
- `export-markdown.ts` dropped the page-level `# title Export` heading (now plain text) and demoted the per-link title from `##` to `###`
- `LinkMention` tooltip's `Positioner` got `z-[60]` so the rich-preview tooltip renders above the export dialog instead of behind it

## Bulk tag picker rewrite (same day)

`BulkTagPicker` rewritten to mirror `TagCombobox` — `Input` for search, filtered list, "Create #foo" item when slug is unique. `slugify` + `events.tagCreated` + per-link `events.linkTagged` commit in one `store.commit(...)` call. `useHotkeyScope("popover")` disables the `selection` scope while open so `Esc` closes the popover instead of clearing selection. Tooltip on the trigger to match Export.

Bulk header right cluster split into two groups with `gap-3` between them: labeled `Complete` / `Archive` (Archive promoted from icon-only to a `HotkeyButton` with label) on the left, icon-only Tag / Export on the right — extra gap protects the tag/export pair from accidental Archive clicks.

Tag rows in `TagCombobox` no longer use `tagColorStyles` — plain `#name` in `font-medium text-foreground`, matching `TagBadge` and the new bulk picker. Tag filter changes (`setTag` / `setUntagged` / `clearFilters` in `useTagFilter`) now drop the multi-selection — tag-strip clicks are list-shaping, so the prior selection becomes meaningless. Bulk picker apply / create does NOT drop the selection (so users can stack tags onto the same set). Tri-state per-tag was considered and rejected as too complex.

## List row compaction + export move (2026-04-30)

- Meta line collapsed to one row — `domain · date · #tag1 #tag2 +N more` (max 2 tags then count)
- Standalone footer tags row dropped
- `TagBadge` got `whitespace-nowrap` so individual tags never wrap
- Description renders via `react-markdown` + `remarkGfm` with all formatting elements (`p`, headings, lists, `blockquote`, `pre`, `hr`, `strong`, `em`, `code`, `del`, `a`) flattened to fragments — markdown tokens are stripped but no inline styles are applied, so the preview reads as clean plain text
- Title content width stays stable across selection-mode toggles via a paired gap / image-col adjustment: `grid-cols-[1fr_4.75rem]` (76px image col, down from 80) with `gap-x-8` (32px) default and `gap-x-2` (8px) when `data-modifier-held` or `data-selection-mode` is on; the 24px checkbox slot fills exactly the difference, and the residual 8px gap keeps the image breathing instead of slamming the title
- Page-level Export moved from `WeeklyDigest` (the right-pane home view) into `DotsMenu` as a route-aware item — `Export inbox` / `Export all links` / `Export completed` / `Export archive` based on `exportAction.title`. The home view is now just the activity grid; `WeeklyDigest` no longer imports `ExportDialog` / `usePageActions` / `Button`
