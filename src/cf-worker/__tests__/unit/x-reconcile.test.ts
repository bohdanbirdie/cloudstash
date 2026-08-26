import { describe, it } from "@effect/vitest";
import { deepStrictEqual, strictEqual } from "@effect/vitest/utils";
import { Effect, Layer } from "effect";

import { OrgId, UserId, XTweetId, XUserId } from "../../db/branded";
import { XUnauthorizedError } from "../../x-sync/errors";
import { reconcileSyncEffect } from "../../x-sync/reconcile";
import { XApiClient } from "../../x-sync/services";
import {
  makeAccountLayer,
  makeAlarmLayer,
  makeQueueLayer,
  makeSnapshot,
  makeStoreLayer,
  makeXApiLayer,
} from "../_helpers/x-sync";

const USER_ID = UserId.make("user-reconcile");
const ORG_ID = OrgId.make("org-reconcile");

const testLayer = (options: {
  store: ReturnType<typeof makeStoreLayer>;
  alarm: ReturnType<typeof makeAlarmLayer>;
  linked?: boolean;
  entitled?: boolean;
  accessToken?: string;
  x?: ReturnType<typeof makeXApiLayer>;
  memberOrgId?: OrgId | null;
  missingOrgIds?: ReadonlySet<string>;
}) =>
  Layer.mergeAll(
    options.store.layer,
    options.alarm.layer,
    makeAccountLayer({
      linked: options.linked,
      entitled: options.entitled,
      accessToken: options.accessToken,
      organizationId: options.memberOrgId,
      missingOrgIds: options.missingOrgIds,
    }).layer,
    (options.x ?? makeXApiLayer([])).layer,
    makeQueueLayer().layer
  );

describe("reconcileSyncEffect", () => {
  it.effect(
    "clears connection state and alarm when the X account is absent",
    () => {
      const store = makeStoreLayer(makeSnapshot());
      const alarm = makeAlarmLayer(true);

      return reconcileSyncEffect(USER_ID, ORG_ID).pipe(
        Effect.provide(testLayer({ store, alarm, linked: false })),
        Effect.tap(() =>
          Effect.sync(() => {
            strictEqual(store.rec.clearCalls, 1);
            deepStrictEqual(alarm.rec, {
              alarmScheduled: false,
              ensureWrites: 0,
              cancelWrites: 1,
              scheduleWrites: 0,
            });
          })
        )
      );
    }
  );

  it.effect(
    "suspends a downgrade before resolving credentials or calling X",
    () => {
      const store = makeStoreLayer(
        makeSnapshot({ watermarkTweetId: XTweetId.make("watermark-1") })
      );
      const alarm = makeAlarmLayer(true);
      const x = makeXApiLayer([]);
      const account = makeAccountLayer({ entitled: false });

      return reconcileSyncEffect(USER_ID, ORG_ID).pipe(
        Effect.provide(
          Layer.mergeAll(
            store.layer,
            alarm.layer,
            account.layer,
            x.layer,
            makeQueueLayer().layer
          )
        ),
        Effect.tap(() =>
          Effect.sync(() => {
            strictEqual(store.rec.snapshot?.status, "suspended");
            strictEqual(store.rec.snapshot?.watermarkTweetId, "watermark-1");
            strictEqual(account.rec.getAccessTokenCalls.length, 0);
            strictEqual(x.calls.length, 0);
            strictEqual(alarm.rec.alarmScheduled, false);
          })
        )
      );
    }
  );

  it.effect(
    "repairs a missing alarm and makes duplicate reconciliation a no-op",
    () => {
      const store = makeStoreLayer(
        makeSnapshot({
          organizationId: ORG_ID,
          watermarkTweetId: XTweetId.make("watermark-healthy"),
        })
      );
      const alarm = makeAlarmLayer();
      const x = makeXApiLayer([]);
      const reconcile = reconcileSyncEffect(USER_ID, ORG_ID);

      return Effect.gen(function* () {
        yield* reconcile;
        yield* reconcile;
        deepStrictEqual(alarm.rec, {
          alarmScheduled: true,
          ensureWrites: 1,
          cancelWrites: 0,
          scheduleWrites: 0,
        });
        strictEqual(store.rec.snapshot?.watermarkTweetId, "watermark-healthy");
        strictEqual(store.rec.setIdentityCalls, 0);
        strictEqual(x.calls.length, 0);
      }).pipe(Effect.provide(testLayer({ store, alarm, x })));
    }
  );

  it.effect("does not rebind an established user poller during repair", () => {
    const boundOrgId = OrgId.make("org-already-bound");
    const store = makeStoreLayer(makeSnapshot({ organizationId: boundOrgId }));
    const alarm = makeAlarmLayer();

    return reconcileSyncEffect(USER_ID, OrgId.make("org-from-repair-row")).pipe(
      Effect.provide(testLayer({ store, alarm })),
      Effect.tap(() =>
        Effect.sync(() => {
          strictEqual(store.rec.organizationId, boundOrgId);
        })
      )
    );
  });

  it.effect("preserves a manual pause", () => {
    const store = makeStoreLayer(makeSnapshot({ syncEnabled: false }));
    const alarm = makeAlarmLayer(true);

    return reconcileSyncEffect(USER_ID, ORG_ID).pipe(
      Effect.provide(testLayer({ store, alarm })),
      Effect.tap(() =>
        Effect.sync(() => {
          strictEqual(store.rec.snapshot?.status, "paused");
          strictEqual(store.rec.snapshot?.syncEnabled, false);
          strictEqual(alarm.rec.alarmScheduled, false);
        })
      )
    );
  });

  it.effect("initializes exactly once when entitlement is upgraded", () => {
    const store = makeStoreLayer(null);
    const alarm = makeAlarmLayer();
    const x = makeXApiLayer([
      {
        kind: "ok",
        page: {
          data: [
            {
              id: XTweetId.make("head-1"),
              text: "existing bookmark",
              author_id: XUserId.make("x-author"),
            },
          ],
        },
      },
    ]);

    return Effect.gen(function* () {
      yield* reconcileSyncEffect(USER_ID, ORG_ID).pipe(
        Effect.provide(testLayer({ store, alarm, entitled: false, x }))
      );

      const activeLayer = testLayer({ store, alarm, entitled: true, x });
      yield* reconcileSyncEffect(USER_ID, ORG_ID).pipe(
        Effect.provide(activeLayer)
      );
      yield* reconcileSyncEffect(USER_ID, ORG_ID).pipe(
        Effect.provide(activeLayer)
      );

      strictEqual(store.rec.setIdentityCalls, 1);
      deepStrictEqual(store.rec.setWatermarkCalls, [XTweetId.make("head-1")]);
      strictEqual(x.calls.length, 1);
      strictEqual(alarm.rec.ensureWrites, 1);
    });
  });

  const invalidTokenLayer = (getMeCalls: string[]) =>
    Layer.succeed(XApiClient, {
      getMe: (accessToken) => {
        getMeCalls.push(accessToken);
        return Effect.fail(new XUnauthorizedError({ endpoint: "/2/users/me" }));
      },
      getBookmarks: () => Effect.die("bookmarks must not be fetched"),
    });

  it.effect("marks an invalid token as needs_reconnect without arming", () => {
    const store = makeStoreLayer(null);
    const alarm = makeAlarmLayer();
    const getMeCalls: string[] = [];

    return reconcileSyncEffect(USER_ID, ORG_ID).pipe(
      Effect.provide(
        Layer.mergeAll(
          store.layer,
          alarm.layer,
          makeAccountLayer().layer,
          invalidTokenLayer(getMeCalls),
          makeQueueLayer().layer
        )
      ),
      Effect.tap(() =>
        Effect.sync(() => {
          strictEqual(store.rec.controlStatus, "needs_reconnect");
          strictEqual(getMeCalls.length, 1);
          strictEqual(alarm.rec.alarmScheduled, false);
        })
      )
    );
  });
});
