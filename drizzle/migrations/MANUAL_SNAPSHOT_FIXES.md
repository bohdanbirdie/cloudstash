# Manual snapshot fixes ⚠️

This file records **hand-edits to drizzle-kit's generated snapshot files** (`meta/*_snapshot.json`).
Snapshots are normally tool-generated and must never be hand-edited — every entry here is an
exception made to repair a drizzle-kit serialization bug. If you add one, document it below.

---

## 2026-05-22 — `0010_snapshot.json`: `organization.cancel_at_period_end` default `"false"` → `false`

**What:** Changed one value in `meta/0010_snapshot.json`:

```diff
 "cancel_at_period_end": {
   ...
-  "default": "false"   // JSON string
+  "default": false     // JSON boolean
 }
```

**Why:** `0010_billing_tier.sql` was hand-authored with an older drizzle-kit, which serialized this
boolean-mode column's default as the **string** `"false"` instead of the boolean `false`. The current
kit (0.31.10) serializes it correctly as `false`. Because SQLite cannot `ALTER` a column default,
drizzle-kit saw the phantom `"false"` → `false` diff and emitted a full **`organization` table rebuild**
(`CREATE __new_organization … DROP TABLE organization … RENAME`) into the next migration.

That rebuild is **destructive**: `member.organization_id` has `ON DELETE CASCADE`, and the rebuild's
`PRAGMA foreign_keys=OFF` is a **no-op inside a transaction** (which is how migrations run), so
`DROP TABLE organization` cascaded and wiped every `member` row. Symptom: users land on the
Pending-approval screen even when `approved=1` (no membership → `activeOrganizationId=null`).

**Why hand-edit instead of regenerating:** there is no tool that normalizes this. `drizzle-kit up` only
bumps the internal snapshot _format_ version, not value content. Upgrading drizzle-kit only fixes how
_new_ snapshots are written — it never rewrites already-committed ones, and we're already on the latest
stable kit (0.31.10; the only newer line is the `drizzle@1.0.0` pre-release). The alternative — squash
and regenerate `0010`+`0011` from the `0009` baseline — rewrites committed history and needs an
interactive `features → feature_overrides` rename answer (a wrong answer there is itself destructive).

**Verification:** after the edit, `bun run db:generate` produced a clean `0011` containing only
`CREATE TABLE app_settings` (no rebuild), and a second `db:generate` reported **"No schema changes"** —
proving the repaired snapshot is byte-equivalent to a freshly generated one.

**Refs:** drizzle-orm issues
[#1406](https://github.com/drizzle-team/drizzle-orm/issues/1406) (boolean default serialized as literal),
[#5360](https://github.com/drizzle-team/drizzle-orm/issues/5360) (SQLite rebuild treats new column as string literal),
[#5661](https://github.com/drizzle-team/drizzle-orm/issues/5661) (spurious default-value migrations — open).

---

## Guardrails for future migrations

- **Review every generated migration before committing.** If it contains a table rebuild
  (`__new_<table>` / `DROP TABLE`) for a change you didn't intend, suspect snapshot drift — diff the
  relevant table between the last two `meta/*_snapshot.json` files to find the phantom change.
- **Never trust `PRAGMA foreign_keys=OFF` in a hand-written rebuild.** It's inert inside the migration
  transaction. If a genuine rebuild of a table with child `ON DELETE CASCADE` FKs is ever required,
  drop/recreate the child FKs explicitly or stage the data.
- **Prefer `drizzle-kit generate` over hand-authoring migrations** — hand-authoring `0010` is what
  introduced this drift in the first place.
