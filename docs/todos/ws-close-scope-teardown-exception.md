# SyncBackendDO `webSocketClose` throws on abnormal close (1006)

Filed 2026-08-10, the day of the effect-v4 + upstream-livestore cutover (PR #82, deploy `bcd404c6`).

## Symptom

Cloudflare invocation analytics show `scriptThrewException` on SyncBackendDO `hibernation`-type invocations. Workers observability pins both events: `webSocketClose` with `code: 1006, wasClean: false` (abnormal client disconnect — tab kill/reload), `wallTimeMs: 1`, `cpuTimeMs: 0`, on the busiest workspace DO (`23c349f9…`).

- 2 occurrences on 2026-08-10 (15:07Z, 16:01Z), both post-deploy, out of ~23 close events that day (the other 21 were normal `clientDisconnected`).
- Zero `scriptThrewException` on this namespace in the entire prior week → migration-introduced delta, not pre-existing.

## Mechanism

Upstream `@livestore/common-cf` `src/ws-rpc/ws-rpc-server.ts:217`:

```ts
const webSocketClose = async (ws, _code, _reason, _wasClean) => {
  const ctx = serverCtxMap.get(ws);
  if (ctx !== undefined) {
    await Scope.close(ctx.scope, Exit.void).pipe(Effect.runPromise);
    serverCtxMap.delete(ws);
  }
};
```

On an abnormal close the scope teardown (interrupting the connection's RPC fibers / finalizers touching the already-dead socket) occasionally rejects; `Effect.runPromise` propagates it out of the handler → CF records the invocation as an exception. Side effect: the throw skips `serverCtxMap.delete(ws)`, leaking the map entry for the dead socket until the DO is evicted.

## Impact

Negligible today: 1 ms wall time, socket already gone, reconnect works (verified during cutover smoke). It is log/metric noise plus a tiny map leak — but it makes `scriptThrewException` useless as a clean error signal for this namespace.

## Fix direction (upstream PR candidate)

Make the close-handler teardown non-throwing: run `Scope.close` with the failure swallowed/logged (e.g. `Effect.exit` + log on failure) and delete the `serverCtxMap` entry in all paths (finally-style). Teardown of an already-closed connection should never surface as an invocation exception. Good first upstream contribution from the v4 codebase (the contributor loop PR #82 unblocked); root-cause the actual rejected teardown while at it.

## Watch condition

If the count grows beyond testing-churn levels (a few/day) or appears with `wasClean: true`, prioritize — that would indicate the teardown failure is broader than the abnormal-close path.

Related: [[architecture/sync-backend-do-hibernation-billing]] (analytics method), [[todos/effect-v4-migration-progress]] (cutover context).
