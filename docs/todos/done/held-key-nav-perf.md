# Held-key keyboard nav perf

Fixed 180ms-per-commit regression during arrow-held nav with detail open.

## Root cause

`links-page-layout.tsx` recreated `handleLinkClick` / `handleLinkActivate` on every `activeLinkId` change (had it in `useCallback` deps), breaking `React.memo` on all 240 rows. Pulled click / activate logic into `link-list.tsx` so handlers read latest `activeLinkId` via ref.

## Other fixes that landed

- `React.memo(DetailViewInner)` so the urgent commit bails when `useDeferredValue` returns the previous `linkId`
- `useMemo(() => linkById$(deferredLinkId))` so livestore doesn't churn its subscription
- `React.memo(Masthead)` + split into `MastheadMeta` child to isolate the four count subscriptions from the heavy h1
- `React.memo(TagStrip)`
- `enableOnFormTags: ["option"]` on every `useHotkeys` call so j/k/arrows/Esc fire when keyboard focus is on a `role="option"` row (the lib's default skip list includes `option`)
- Roving tabindex with anchor ref + `tabStop` state
- Hover-blur to clear the focus ring when mouse takes over the cursor anchor
- Dropped the `requestAnimationFrame(() => element.focus())` in `closeDetail` that caused "page scrolls back to last clicked link"

Final post-fix max commit ~45ms in dev (~50% is dev-mode overhead — `jsxDEV`, React DevTools profiler hooks).

## Extracted helpers

Pure helpers extracted to `src/lib/listbox-keyboard.ts`:

- `findRowInContainer`
- `focusRowById`
- `clearKeyboardFocusFromOtherRow`
- `computeTargetIndex`

30 unit tests under `src/lib/__tests__/listbox-keyboard.test.ts`.
