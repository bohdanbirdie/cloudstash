import {
  abortAllDurableObjects,
  env,
  runInDurableObject,
} from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import type { LinkQueueMessage } from "../../link-processor/types";
import { signupUser } from "./helpers";
import type { UserInfo } from "./helpers";

/**
 * Reproduction of the cold-DO stranding bug
 * (`docs/todos/server-ingest-cold-do-stranding.md`): `ingestAndProcess` commits
 * `linkCreatedV2` to the LinkProcessorDO's *local* store and returns, but the
 * push of that event to the SyncBackendDO eventlog runs in a background fiber
 * that is killed when the request-scoped DO host is evicted — so the link never
 * reaches the server until the next ingest re-boots the DO and drains the backlog.
 *
 * STATUS: fixed with a two-stage session-to-leader-to-backend durability
 * barrier. All four regression cases run against the real Durable Objects and
 * the SyncBackend's persisted eventlog.
 */

const ingestMessage = (storeId: string, url: string): LinkQueueMessage =>
  ({ url, storeId, source: "api", sourceMeta: null }) as LinkQueueMessage;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The SyncBackend DO's OWN persisted eventlog head, read from a FRESH stub
// (pre-abort stubs are poisoned). This is the source of truth — independent of
// the LinkProcessorDO's lifecycle.
const backendMax = (storeId: string): Promise<number | null> =>
  env.SYNC_BACKEND_DO.get(
    env.SYNC_BACKEND_DO.idFromName(storeId)
  ).getEventlogMax();

// Poll the backend head until it settles (unchanged across a few reads) above
// `floor`, or the cap elapses. Returns the last head observed.
const settledBackendMax = async (
  storeId: string,
  floor: number
): Promise<number> => {
  let prev = -1;
  let stable = 0;
  let head = 0;
  for (let i = 0; i < 200; i++) {
    head = (await backendMax(storeId)) ?? 0;
    if (head === prev) {
      stable++;
      if (stable >= 3 && head > floor) break;
    } else {
      stable = 0;
    }
    prev = head;
    await delay(75);
  }
  return head;
};

// Best-effort: close the client store's livePull connection so a subsequent
// `abortAllDurableObjects()` doesn't deadlock on the open WebSocket
// (docs/todos/server-ingest-cold-do-stranding.md).
const quiesce = async (lp: DurableObjectStub): Promise<void> => {
  try {
    await runInDurableObject(lp, async (instance) => {
      const holder = instance as unknown as {
        cachedStore?: { shutdownPromise?: () => Promise<void> };
      };
      await holder.cachedStore?.shutdownPromise?.();
    });
  } catch {
    // best-effort
  }
};

describe("server-ingest cold-DO stranding", () => {
  // 1) The eviction lever the bug depends on. `abortAllDurableObjects()` tears
  //    down the in-memory DO isolate (as Cloudflare does on idle eviction)
  //    without deleting persisted SQLite — proven by a fresh random incarnation
  //    id after the abort. This is exactly what kills the un-awaited background
  //    push fiber in production.
  it("abortAllDurableObjects evicts: in-memory state is destroyed and recreated", async () => {
    const id = env.LINK_PROCESSOR_DO.idFromName("eviction-probe-store");
    const incarnationOf = (stub: DurableObjectStub) =>
      runInDurableObject(stub, (instance) => {
        const probe = instance as { __incarnation?: string };
        probe.__incarnation ??= crypto.randomUUID();
        return probe.__incarnation;
      });

    const before = await incarnationOf(env.LINK_PROCESSOR_DO.get(id));
    await abortAllDurableObjects();
    // A fresh stub is required — stubs created before the abort are poisoned.
    const after = await incarnationOf(env.LINK_PROCESSOR_DO.get(id));

    expect(before).toBeTruthy();
    expect(after).not.toBe(before);
  });

  describe("ingestAndProcess durability-on-return", () => {
    let user: UserInfo;

    beforeAll(async () => {
      user = await signupUser("strand-e2e@test.com", "Strand E2E");
    });

    // `ingestAndProcess` must not resolve until the committed `linkCreatedV2` is
    // durable on the SyncBackend. We assert the SyncBackend DO's OWN persisted
    // eventlog (`getEventlogMax() > 0`), read from a FRESH stub — the source of
    // truth, independent of the LinkProcessorDO's lifecycle and its leader-sync
    // bookkeeping (the surface the fix manipulates). An event durable here
    // survives the client DO being evicted, which is the actual guarantee.
    //
    // Pre-fix this was TDD-red: the push was fire-and-forget, so at return the
    // SyncBackend eventlog was empty (`getEventlogMax()` → null → 0). It passes
    // now that `ingestAndProcess` awaits `whenLeaderSynced(...)` before
    // returning. `> 0` (rather than an exact head) tolerates the processing
    // pipeline's follow-on events.
    it(
      "ingestAndProcess resolves only after the committed event is durable on the SyncBackend",
      { timeout: 30000 },
      async () => {
        const storeId = user.orgId;
        const lp = env.LINK_PROCESSOR_DO.get(
          env.LINK_PROCESSOR_DO.idFromName(storeId)
        );

        const r = await lp.ingestAndProcess(
          ingestMessage(storeId, "https://example.com/cloudstash-strand")
        );
        expect(r.status).toBe("ingested");

        // Source of truth: the SyncBackend DO's own persisted eventlog, read from
        // a FRESH stub. The LinkProcessorDO connects to this exact backend via
        // `SYNC_BACKEND_DO.idFromName(storeId)` (durable-object.ts), so the event
        // it pushed lands here — and it stays here regardless of the client DO's
        // fate. Pre-fix: empty (null → 0). Post-fix: > 0.
        const sbMax = await env.SYNC_BACKEND_DO.get(
          env.SYNC_BACKEND_DO.idFromName(storeId)
        ).getEventlogMax();
        expect(sbMax ?? 0).toBeGreaterThan(0);
      }
    );
  });

  // The RPC barrier (Test above) only guarantees `linkCreatedV2` is durable at
  // return. The processing follow-on events (metadata or failure, terminal
  // status, notification) are
  // committed by the SUBSCRIPTION handler AFTER `ingestAndProcess` returns, and
  // their durability rests on the second `whenLeaderSynced` barrier held by
  // `ctx.waitUntil` (durable-object.ts). That path had zero coverage.
  // The example.com URL deterministically exercises the metadata-failure path,
  // keeping the test offline/fast while still producing follow-on commits.
  // Polls the SyncBackend's own eventlog to watch those events land, then aborts
  // to confirm they survive eviction.
  describe("subscription-path full-pipeline durability", () => {
    it(
      "the processing follow-on pipeline reaches the SyncBackend and survives eviction",
      { timeout: 30000 },
      async () => {
        const user = await signupUser(
          "strand-pipeline@test.com",
          "Strand Pipe"
        );
        const storeId = user.orgId;
        const lp = env.LINK_PROCESSOR_DO.get(
          env.LINK_PROCESSOR_DO.idFromName(storeId)
        );

        await lp.ingestAndProcess(
          ingestMessage(storeId, "https://example.com/cloudstash-pipeline")
        );
        // Head at RPC return ≈ `linkCreatedV2` only (the RPC barrier's guarantee).
        const headAtReturn = (await backendMax(storeId)) ?? 0;
        expect(headAtReturn).toBeGreaterThan(0);

        // The subscription barrier must drive the follow-on events durable.
        // Settling above `headAtReturn` proves they reached the backend, not just
        // the creation event — the previously-uncovered second barrier.
        const settled = await settledBackendMax(storeId, headAtReturn);
        expect(settled).toBeGreaterThan(headAtReturn);

        // Now evict and re-read from a FRESH stub: the drained pipeline must
        // remain on the SyncBackend's persisted eventlog. Quiesce first so the
        // client's livePull socket doesn't deadlock the abort.
        await quiesce(lp);
        await abortAllDurableObjects();
        const afterEviction = (await backendMax(storeId)) ?? 0;
        expect(afterEviction).toBeGreaterThanOrEqual(settled);
      }
    );
  });

  // The original incident was a SEQUENCE: link #1 strands in local SQLite, and
  // only link #2's cold-boot reboot drains both. This asserts each ingest is
  // independently durable at its OWN return — #2's event is on the backend
  // without waiting for a hypothetical #3. No eviction needed.
  describe("sequential ingests are independently durable", () => {
    it(
      "two back-to-back ingests each land on the SyncBackend at return",
      { timeout: 30000 },
      async () => {
        const user = await signupUser("strand-seq@test.com", "Strand Seq");
        const storeId = user.orgId;
        const lp = env.LINK_PROCESSOR_DO.get(
          env.LINK_PROCESSOR_DO.idFromName(storeId)
        );

        await lp.ingestAndProcess(
          ingestMessage(storeId, "https://example.com/seq-a")
        );
        const afterFirst = (await backendMax(storeId)) ?? 0;
        expect(afterFirst).toBeGreaterThan(0);

        await lp.ingestAndProcess(
          ingestMessage(storeId, "https://example.com/seq-b")
        );
        const afterSecond = (await backendMax(storeId)) ?? 0;
        expect(afterSecond).toBeGreaterThan(afterFirst);
      }
    );
  });
});
