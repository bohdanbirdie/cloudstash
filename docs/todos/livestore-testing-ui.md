# Livestore UI feature tests

React Testing Library + livestore in-memory adapter. Each test boots a real store, wraps the component with `LiveStoreProvider`, renders, interacts, asserts on DOM **and** store state.

Depends on [[livestore-testing-data]] — the test-helpers and in-memory adapter plumbing land there first.

## Phase B0 — Infrastructure

- Verify `@testing-library/react`, `@testing-library/dom`, `jsdom` are usable (already installed per package.json)
- Add `@testing-library/user-event` if missing
- `src/__tests__/render.tsx`
  - `renderWithStore(ui, { seed })` — wraps with `LiveStoreProvider` + any required router / auth context
  - Accepts seed events (commits them before the first render) or raw seed state
- Decide location: `src/components/__tests__/` co-located per component, or top-level `src/__tests__/features/`

## Phase B1 — Hooks

- `use-link-tags.test.tsx` — add/remove tag diffing commits correct events
- `use-filtered-links.test.tsx` — reactive filter composition
- `use-tag-filter.test.tsx`

## Phase B2 — Feature dialogs / components

- `add-link-dialog.test.tsx` — submit flow commits `linkCreatedV2`
- `link-detail-dialog.test.tsx` — complete/uncomplete/delete/restore buttons commit correct events, subscribe to `linkById$` updates reactively
- `tag-manager-dialog.test.tsx` — create/rename/reorder/delete tag flows, deletion cascade
- `tag-suggestions.test.tsx` — accept/dismiss flows
- `search-command.test.tsx` — search query reactivity
- `app-sidebar.test.tsx` — count badges update as events commit

## Phase B3 — Route-level (optional)

- Render `_authed` routes with seeded store, exercise navigation + filtering
