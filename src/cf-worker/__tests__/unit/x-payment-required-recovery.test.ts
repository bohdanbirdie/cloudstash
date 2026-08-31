import { describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { expect } from "vitest";

import { UserId, XTweetId } from "../../db/branded";
import { OtelTracingLive } from "../../tracing";
import { XPaymentRequiredError } from "../../x-sync/errors";
import { pollReconciledEffect } from "../../x-sync/poll";
import {
  reconcileSyncEffect,
  reconnectSyncEffect,
} from "../../x-sync/reconcile";
import { XSyncStateStore } from "../../x-sync/services/x-sync-state-store";
import {
  makeAccountLayer,
  makeAlarmLayer,
  makeQueueLayer,
  makeSnapshot,
  makeStoreLayer,
  makeXApiLayer,
  ORG_ID,
  USAGE_WINDOW,
} from "../_helpers/x-sync";

const USER_ID = UserId.make("user-402");

// Regression: WK-08-A.
//
// poll.ts maps both XUnauthorizedError (401) and XPaymentRequiredError (402)
// to the single status "needs_reconnect". reconcile.ts then tries to recover
// that status by calling getMe, which only ever reports 401 — x-api-client
// maps a 402 from getMe to a plain XApiError, and only getBookmarks produces
// XPaymentRequiredError at all.
//
// So for an account parked by a bookmarks-only 402, the recovery check cannot
// observe the condition it is meant to clear. getMe succeeds, reconcile
// returns the account to "active" and re-arms the alarm, and the next poll
// fails on bookmarks again.
describe("x-sync recovery from a payment-required park", () => {
  it.effect("keeps the account parked when only bookmarks is 402", () => {
    const store = makeStoreLayer(
      makeSnapshot({
        organizationId: ORG_ID,
        watermarkTweetId: XTweetId.make("t1"),
      })
    );
    const alarm = makeAlarmLayer();
    // getMe always succeeds in this layer. Only the scripted bookmarks call
    // fails, which is how X reports an access-level problem.
    const x = makeXApiLayer([
      {
        kind: "fail",
        error: new XPaymentRequiredError({ endpoint: "bookmarks" }),
      },
    ]);
    const queue = makeQueueLayer();

    const layers = Layer.mergeAll(
      store.layer,
      alarm.layer,
      makeAccountLayer({ organizationId: ORG_ID }).layer,
      x.layer,
      queue.layer,
      OtelTracingLive
    );

    return Effect.gen(function* () {
      const stateStore = yield* XSyncStateStore;
      const state = yield* stateStore.read();
      if (!state || !state.xUserId) {
        return yield* Effect.die("test requires connected state");
      }

      // 1. A bookmarks 402 parks the account. This part works today.
      const outcome = yield* pollReconciledEffect(
        USER_ID,
        ORG_ID,
        state,
        "tok-1",
        USAGE_WINDOW,
        300
      );
      expect(outcome).toEqual({ kind: "needs_reconnect" });
      expect(store.rec.controlStatus).toBe("needs_reconnect");

      // 2. The next reconcile runs its recovery check.
      yield* reconcileSyncEffect(USER_ID, ORG_ID);

      // 3. The account must stay parked, because nothing has changed: the
      //    bookmarks endpoint is still refusing. Today reconcile flips it back
      //    to "active" and arms the alarm, so the loop repeats every poll.
      expect(store.rec.controlStatus).toBe("needs_reconnect");
      expect(alarm.rec.alarmScheduled).toBe(false);
    }).pipe(Effect.provide(layers));
  });
});

describe("x-sync recovery after the user re-authorizes", () => {
  it.effect("clears an access-level park so reconcile can activate", () => {
    const store = makeStoreLayer(
      makeSnapshot({
        organizationId: ORG_ID,
        status: "needs_reconnect",
        watermarkTweetId: XTweetId.make("t1"),
      })
    );
    store.rec.reconnectReason = "access_level";
    const alarm = makeAlarmLayer();
    const x = makeXApiLayer([]);
    const queue = makeQueueLayer();

    const layers = Layer.mergeAll(
      store.layer,
      alarm.layer,
      makeAccountLayer({ organizationId: ORG_ID }).layer,
      x.layer,
      queue.layer,
      OtelTracingLive
    );

    return Effect.gen(function* () {
      // Plain reconcile — the polling path — must leave the park alone.
      yield* reconcileSyncEffect(USER_ID, ORG_ID);
      expect(store.rec.controlStatus).toBe("needs_reconnect");
      expect(alarm.rec.alarmScheduled).toBe(false);

      // Completing OAuth is the user asserting the problem is fixed. It is the
      // only recovery the UI offers for needs_reconnect, so it has to work.
      yield* reconnectSyncEffect(USER_ID, ORG_ID);
      expect(store.rec.controlStatus).toBe("active");
      expect(alarm.rec.alarmScheduled).toBe(true);
    }).pipe(Effect.provide(layers));
  });
});
