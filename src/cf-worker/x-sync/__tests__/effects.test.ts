import { describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { expect, vi } from "vitest";

import { makeStoreLayer, makeXApiLayer } from "../../__tests__/_helpers/x-sync";
import { AuthClient } from "../../auth/service";
import { UserId } from "../../db/branded";
import { DbClient } from "../../db/service";
import { getAccessTokenEffect, startSyncEffect } from "../effects";
import { XSyncSideEffectError } from "../errors";

const USER_ID = UserId.make("user-1");

const dbLayer = (findFirst: ReturnType<typeof vi.fn>) =>
  Layer.succeed(DbClient, {
    query: { account: { findFirst } },
  } as unknown as DbClient["Service"]);

const authLayer = (getAccessToken: ReturnType<typeof vi.fn>) =>
  Layer.succeed(AuthClient, {
    api: { getAccessToken },
  } as unknown as AuthClient["Service"]);

describe("getAccessTokenEffect", () => {
  it.effect("selects the local X account row id for Better Auth", () => {
    const findFirst = vi.fn(() => Promise.resolve({ id: "local-x-row" }));
    const getAccessToken = vi.fn(() =>
      Promise.resolve({ accessToken: "access-token" })
    );

    return getAccessTokenEffect(USER_ID).pipe(
      Effect.provide(
        Layer.mergeAll(dbLayer(findFirst), authLayer(getAccessToken))
      ),
      Effect.tap((token) =>
        Effect.sync(() => {
          expect(token).toBe("access-token");
          expect(getAccessToken).toHaveBeenCalledWith({
            body: { accountId: "local-x-row", userId: USER_ID },
          });
        })
      )
    );
  });

  it.effect(
    "returns null without calling Better Auth when X is unlinked",
    () => {
      const findFirst = vi.fn(() => Promise.resolve(undefined));
      const getAccessToken = vi.fn(() =>
        Promise.resolve({ accessToken: "unexpected" })
      );

      return getAccessTokenEffect(USER_ID).pipe(
        Effect.provide(
          Layer.mergeAll(dbLayer(findFirst), authLayer(getAccessToken))
        ),
        Effect.tap((token) =>
          Effect.sync(() => {
            expect(token).toBeNull();
            expect(getAccessToken).not.toHaveBeenCalled();
          })
        )
      );
    }
  );

  it.effect("propagates account lookup failure so the caller can retry", () => {
    const findFirst = vi.fn(() => Promise.reject(new Error("D1 unavailable")));
    const getAccessToken = vi.fn(() =>
      Promise.resolve({ accessToken: "unexpected" })
    );

    return getAccessTokenEffect(USER_ID).pipe(
      Effect.provide(
        Layer.mergeAll(dbLayer(findFirst), authLayer(getAccessToken))
      ),
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("DbError");
          expect(getAccessToken).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("propagates Better Auth failure so the caller can retry", () => {
    const findFirst = vi.fn(() => Promise.resolve({ id: "local-x-row" }));
    const getAccessToken = vi.fn(() =>
      Promise.reject(new Error("Better Auth unavailable"))
    );

    return getAccessTokenEffect(USER_ID).pipe(
      Effect.provide(
        Layer.mergeAll(dbLayer(findFirst), authLayer(getAccessToken))
      ),
      Effect.flip,
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("XSyncSideEffectError");
        })
      )
    );
  });
});

describe("startSyncEffect", () => {
  it.effect(
    "fails the start after initialization when the alarm cannot be armed",
    () => {
      const findFirst = vi.fn(() => Promise.resolve({ id: "local-x-row" }));
      const store = makeStoreLayer(null);
      const alarmError = new XSyncSideEffectError({
        cause: new Error("storage unavailable"),
        op: "storage.setAlarm",
      });

      return startSyncEffect(USER_ID, Effect.fail(alarmError)).pipe(
        Effect.provide(
          Layer.mergeAll(
            store.layer,
            makeXApiLayer([]).layer,
            dbLayer(findFirst),
            authLayer(
              vi.fn(() => Promise.resolve({ accessToken: "access-token" }))
            )
          )
        ),
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error).toBe(alarmError);
            expect(store.rec.setIdentityCalls).toBe(1);
          })
        )
      );
    }
  );

  it.effect("does not arm a retry when the X account is unlinked", () => {
    const armAlarm = vi.fn();
    const findFirst = vi.fn(() => Promise.resolve(undefined));
    const getAccessToken = vi.fn();

    return startSyncEffect(USER_ID, Effect.sync(armAlarm)).pipe(
      Effect.provide(
        Layer.mergeAll(
          makeStoreLayer(null).layer,
          makeXApiLayer([]).layer,
          dbLayer(findFirst),
          authLayer(getAccessToken)
        )
      ),
      Effect.tap((initialized) =>
        Effect.sync(() => {
          expect(initialized).toBe(false);
          expect(armAlarm).not.toHaveBeenCalled();
          expect(getAccessToken).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect(
    "retries initialization after a transient account lookup failure",
    () => {
      const armAlarm = vi.fn();
      const store = makeStoreLayer(null);
      const x = makeXApiLayer([]);
      const findFirst = vi
        .fn()
        .mockRejectedValueOnce(new Error("D1 unavailable"))
        .mockResolvedValue({ id: "local-x-row" });
      const getAccessToken = vi.fn(() =>
        Promise.resolve({ accessToken: "access-token" })
      );
      const start = startSyncEffect(USER_ID, Effect.sync(armAlarm));

      return Effect.gen(function* () {
        const firstFailure = yield* start.pipe(Effect.flip);
        expect(firstFailure._tag).toBe("DbError");
        expect(armAlarm).toHaveBeenCalledOnce();

        yield* start;
        expect(armAlarm).toHaveBeenCalledTimes(2);
        expect(findFirst).toHaveBeenCalledTimes(2);
        expect(getAccessToken).toHaveBeenCalledOnce();
        expect(store.rec.setIdentityCalls).toBe(1);
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            store.layer,
            x.layer,
            dbLayer(findFirst),
            authLayer(getAccessToken)
          )
        )
      );
    }
  );
});
