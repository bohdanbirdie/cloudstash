# Rename "Trash" → "Archive"

## Touchpoints

- Route slug `/trash` → `/archive`
- Page title and meta copy ("X archived")
- Category nav
- Detail-view tag ("Archived")
- Chat confirmation copy
- Selection toolbar `isArchive` prop
- Internal queries (`archiveLinks$` / `archiveCount$` / `archiveProjection`)
- `LinkStatus` `"archive"`
- Icon registry

Livestore event names and the `deletedAt` schema column unchanged.
