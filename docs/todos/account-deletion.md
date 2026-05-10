# Account deletion

GDPR-compliant hard account deletion. Solo-org model: deleting a user = deleting their org and every byte of data tied to it.

**Status:** shipped, verified end-to-end in local dev (2026-05-10). 29 unit tests + 1 pool-workers e2e pass. lint / typecheck / Effect-LS all clean.

## Architecture

Two phases — synchronous setup inside Better Auth, then a durable Workflow for the actual purges.

### Phase 1 — `prepareDeletion` (sync)

Runs inside `user.deleteUser.beforeDelete`. Fail-loud (throwing aborts the entire deletion). Ultra-thin so the user-facing hot path doesn't depend on per-purge availability:

```
1. Resolve user → orgId via member table
2. ensureWorkflow(orgId) — get / restart / create the AccountDeletionWorkflow
```

Then Better Auth proceeds with `internalAdapter.deleteUser` (deletes session/account/user; FK cascades clean member, apikey, invitation, invite).

### Phase 2 — `AccountDeletionWorkflow`

```
mark-link-processor-deleting   ← race-tight tombstone, before any wipe
wipe-link-processor   (DO RPC: ctx.storage.deleteAll)
wipe-sync-backend     (DO RPC: ctx.storage.deleteAll)
wipe-chat-agent       (DO RPC: ctx.storage.deleteAll)
purge-telegram        (KV reverse-index → forward-key wipe)
delete-org            (D1 DELETE — FK cascade clears member, apikey, invitation, …)
```

Each step idempotent. Step retry: 5 retries, 10s base, exponential backoff, 1m timeout. Failures propagate; CF marks the workflow `errored` and we triage from OTEL spans + structured logs. `purge-telegram` runs late so a TELEGRAM_KV outage can't block GDPR-relevant D1/DO wipes.

### Why this shape

- **External state first, auth row last.** A mid-delete crash leaves a user logged-out-but-resumable rather than orphaned blobs with no owner.
- **Workflow over Queue+DLQ.** Multi-step durable orchestration with free retry + step-level observability. The "GDPR 30-day" deadline gives massive slack.
- **No `account_deletion_jobs` table.** Workflows already track status, retries, and history. `orgId` IS the workflow instance id. No D1 dedup row, no separate jobId, no queue-handler gate (the in-DO tombstone is the only correctness primitive).

## Code architecture

Three Effect Tags total — no service ceremony:

| Tag               | Where                                 | Responsibility                                                                                                              |
| ----------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `DbClient`        | `db/service.ts` (existing)            | Drizzle wrapper                                                                                                             |
| `DeletionRuntime` | `account-deletion/runtime.ts`         | Wraps env (DO + Workflow bindings) as Effect-typed methods. Single `DeletionRuntimeError` with `op` discriminator.          |
| `CfStep`          | `account-deletion/workflow.ts`        | Per-invocation: the `step` arg from `WorkflowEntrypoint.run()`. Provided via `Layer.succeed(CfStep, step)` at the workflow entry; tests substitute a duck-typed mock. |

The orchestration is one `Effect.gen` over those Tags. A single `step(name, body, options?)` helper bridges Effect → CF's Promise callback in **one place**:

```ts
yield* step("purge-telegram", runtime.purgeTelegram(userId, orgId), STEP_RETRY);
yield* step("wipe-link-processor", runtime.purgeLinkProcessor(orgId), STEP_RETRY);
```

The CF Workflow class (`workflows/account-deletion.ts`) is a ~30-line shell: decode payload via `Schema.decodeUnknown` **inside** the Effect chain, provide `AppLayerLive(env)`, run with `Effect.tapErrorCause(Cause.pretty)`.

## Idempotency

`runtime.ensureWorkflow(params)` keyed on `orgId`:

```
get(orgId) succeeds → status() → active: reuse | terminal: restart() with same id
get(orgId) fails    → fall through to create({ id: orgId, params })
```

**Any** `get()` failure routes to `create()` — CF emits varying not-found messages across environments, so substring-sniffing was brittle. If the failure was actually transient, `create()` surfaces it tagged `step: "create"`.

Better Auth's three-statement deletion sequence may retry Phase 1 mid-stream; each retry hits `ensureWorkflow`, finds the live instance, returns its handle.

## Better Auth integration

`better-auth@1.5.5`. `user.deleteUser.enabled: true`, `sendDeleteAccountVerification` undefined → falls through to `freshAge` (24h). The type-`DELETE` UI is the user-facing confirmation; no email infrastructure. `freshAge` failures surface as `SESSION_EXPIRED` and the UI handles them. FK cascades (configured on `member`, `account`, `apikey`, `session`, `invite`, `invitation`) handle plugin-table cleanup — Better Auth's organization/apiKey plugins have no user-delete hooks of their own.

## Schema changes

Migration `0009_*`:

- `invitation.inviterId` → `onDelete: "cascade"` (was no rule; would orphan)
- `session.activeOrganizationId` → `onDelete: "set null"` (was no rule; would dangle)

`WorkflowInstanceId` brand added in `db/branded.ts`.

## Files

**New**

- `src/cf-worker/account-deletion/{runtime,workflow,prepare,telegram}.ts`
- `src/cf-worker/workflows/account-deletion.ts` (CF Workflow shell)
- `src/cf-worker/link-processor/deletion-tombstone.ts`
- 5 unit test files + `src/cf-worker/__tests__/e2e/delete-account.test.ts` (pool-workers)
- `src/lib/delete-account.ts` — typed `deleteAccount()` helper for the UI; brittle `error.code === "SESSION_EXPIRED"` match contained behind `DeleteAccountError` tag
- `src/components/settings/{settings-modal,delete-account-dialog}.tsx` — settings shell + extracted destructive-action dialog

**Modified**

- `src/cf-worker/auth/{index,service}.ts` — wires `prepareDeletion` into `beforeDelete`; `AppLayerLive` now includes `DeletionRuntimeLive`
- `src/cf-worker/{link-processor/durable-object,sync/index,chat-agent/index}.ts` — `purgeAll()` (and tombstone gate in LinkProcessor) wrapped in `Effect.runPromise` + spans
- `src/cf-worker/queue-handler.ts` — Effect-typed batch handler; deletion gate removed (tombstone is the sole barrier)
- `src/cf-worker/db/schema.ts`, `wrangler.toml`, `vitest.config.ts`

OPFS clearing on logout / post-deletion is handled by `routes/login.tsx`'s mount effect; no localStorage flag.

## Decisions log

- **Telegram chat_id purge — option B (reverse KV index).** `linkUser(userId, chatId)` writes `telegram-user:${userId}` → JSON `number[]` on every `/connect`. `purgeForUser(userId)` reads it and wipes each forward `telegram:${chatId}` plus the index itself. `/disconnect` intentionally does NOT update the reverse — the slight staleness only affects deletion-time iteration (forward is already gone → `KV.delete` no-op). Legacy entries from before the index are functionally inert (apikey FK cascade kills authn) but their chat_ids persist as accepted residue.
- **ChatAgentDO purge is not redundant with SyncBackend.** `createStoreDoPromise` persists LiveStore client state inside the **hosting DO's own** `ctx.storage`; `syncBackendStub` is RPC-only. `SyncBackendDO.purgeAll()` wipes the org-level eventlog; `ChatAgentDO.purgeAll()` wipes the chat-agent's session id, AIChatAgent message history, and `usage:${period}` counters. Both required.
- **B1 (Livestore shutdown + fiber tracking) deferred.** Tombstone + `ctx.storage.deleteAll()` + ~30s DO eviction make new ingestion impossible by the time Phase 1 returns. Pre-existing in-flight queue messages are bounded and harmless (their writes get wiped seconds later). Solution remains documented if production logs show corruption.

## Tests

| File                    | Tests |
| ----------------------- | ----- |
| `runtime.test.ts`       | 17    |
| `workflow.test.ts`      | 4     |
| `prepare.test.ts`       | 6     |
| `telegram.test.ts`      | 2     |
| `delete-account.test.ts` (e2e) | 1 |

Pure Effect Layer DI throughout (no `vi.mock` for service replacement).
