# Per-tag text colors

Bring back per-tag color from `tag-colors.ts` (still used by `tag-row.tsx`) but apply only as text `color` on the `#name`, not as a colored background/badge.

## Touchpoints

- `TagBadge` everywhere it's rendered: list row meta line, detail-view editor, tag-strip
- Dropdown rows in `BulkTagPicker` and `TagCombobox`

## Goal

Tags stay readable in dense rows but the list still feels typographic, not painted.
