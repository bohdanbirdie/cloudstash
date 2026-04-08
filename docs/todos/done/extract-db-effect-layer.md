# Extract DB into Effect Layer

Extracted DB access into Effect services with typed errors. All DB operations go through domain services with `DbError` in the error channel.

## What was done

- `DbClient` (`Context.Tag`) wrapping Drizzle instance
- `AuthClient` wrapping better-auth with enriched admin methods
- `AppLayerLive(env)` composite layer providing both
- `OrgFeatures` service — consolidated org features lookup from 5 files
- `InviteStore` service — encapsulated all invite CRUD
- `DbError` tagged error + `query()` helper for typed DB errors
- 3 new test files (29 tests) using `Layer.succeed()` for DI — zero `vi.mock`
- Migrated all 14 consumer files

## Architecture

```
Handlers → Domain Services → DbClient → D1
```

Domain services: OrgFeatures, InviteStore, AuthClient, Connect services (apikey, verification).

Key properties: DbClient only visible inside service implementations, all DB calls use `query()` with typed `DbError`, tests swap layers via `Layer.succeed()`.
