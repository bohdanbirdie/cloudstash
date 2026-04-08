# Drop @livestore/common-cf patch

The `@livestore/common-cf` patch (`flat(1)` for merged RPC buffers) is being fixed upstream in [PR #1163](https://github.com/livestorejs/livestore/pull/1163).

Once PR #1163 merges and we update to a livestore snapshot that includes it, remove:

- `patches/@livestore%2Fcommon-cf@0.0.0-snapshot-*.patch`

Verify sync still works after removing (Telegram link → appears in browser UI).

See [[incidents/2026-04-link-processor-sync-bug]] for full context.
