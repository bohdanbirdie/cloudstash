import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, References } from "effect";

import { OrgId, UserId } from "../../db/branded";
import { DbClient } from "../../db/service";
import { DigestScheduleReconciler } from "../../weekly-digest/reconcile";
import {
  XReconcileQueue,
  XReconcileQueueError,
} from "../../x-sync/reconcile-queue";
import { reconcileTierDependents } from "../workspaces";

const ORG_ID = OrgId.make("org-1");
const USER_ID = UserId.make("user-1");

const quiet = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(Effect.provideService(References.MinimumLogLevel, "None"));

const linkedXAccount = Layer.succeed(DbClient, {
  selectDistinct: () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => Promise.resolve([{ userId: USER_ID }]),
      }),
    }),
  }),
} as never);

describe("reconcileTierDependents", () => {
  it.effect("attempts digest reconciliation when the X enqueue fails", () => {
    const digestCalls: OrgId[] = [];
    const digest = Layer.succeed(DigestScheduleReconciler, {
      reconcile: (orgId) =>
        Effect.sync(() => {
          digestCalls.push(orgId);
        }),
    });
    const xQueue = Layer.succeed(
      XReconcileQueue,
      XReconcileQueue.of({
        send: ({ orgId, userId }) =>
          Effect.fail(
            new XReconcileQueueError({
              cause: new Error("queue unavailable"),
              message: "Failed to enqueue X reconciliation",
              orgId,
              userId,
            })
          ),
      })
    );

    return reconcileTierDependents(ORG_ID).pipe(
      Effect.provide(Layer.mergeAll(digest, linkedXAccount, xQueue)),
      quiet,
      Effect.tap((failed) =>
        Effect.sync(() => {
          expect(failed).toBe(true);
          expect(digestCalls).toEqual([ORG_ID]);
        })
      )
    );
  });
});
