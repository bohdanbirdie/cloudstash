# Duplicate tag crashes Livestore + error handling + tests

**Bug:** Applying the same tag twice causes Livestore to shut down with `LiveStore.UnknownError: Store has been shut down (while performing "commit")`.

**Repro:** AI suggests two identical tags → user accepts both → second commit crashes the store.

**Fix:**

1. Duplicate tag deduplication before commit
2. Livestore commit errors caught gracefully in the UI (toast instead of crash)
3. Tests added for Livestore operations
