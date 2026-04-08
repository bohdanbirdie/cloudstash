# Implement Proper Logout OPFS Cleanup

Currently logout only sets a localStorage flag (`RESET_FLAG_KEY`) and calls `authClient.signOut()`. The flag signals the livestore adapter to reset OPFS on next login, but cached data remains on disk until then.

## What to do

Create a `/logout` route (outside `_authed` layout) that:
1. Unmounts LiveStore (stops rendering `_authed` children)
2. Clears OPFS directories via `navigator.storage.getDirectory()` — iterate `livestore-*` entries
3. Calls `authClient.signOut()`
4. Redirects to `/login`

The key constraint: OPFS files are locked while LiveStore is mounted. The `/logout` route must be outside the `_authed` layout so LiveStore unmounts before cleanup runs.

## Relevant files

- `src/lib/auth.tsx` — current logout function with `RESET_FLAG_KEY`
- `src/routes/_authed.tsx` — authed layout that mounts LiveStore
- `docs/architecture/auth.md` — documents the current flag-based approach
