import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Result } from "effect";

import {
  StripeSubscriptionId,
  UserId,
  WorkflowInstanceId,
} from "../../db/branded";
import { DbClient, DbError } from "../../db/service";
import {
  MissingActiveOrgError,
  prepareDeletion,
  SharedPersonalOrgError,
} from "../prepare";
import { DeletionRuntime, DeletionRuntimeError } from "../runtime";
import type { AccountDeletionParams } from "../runtime";

const USER_ID = UserId.make("user-1");
const ORG_ID = "org-1";

const makeDbStub = (
  options: {
    org?: { id: unknown; stripeSubscriptionId: unknown } | undefined;
    memberships?: readonly { role: string; userId: string }[];
    orgLookupError?: unknown;
  } = {}
) => {
  const org =
    "org" in options
      ? options.org
      : { id: ORG_ID, stripeSubscriptionId: "sub-1" };
  const memberships =
    "memberships" in options
      ? options.memberships
      : [{ role: "owner", userId: USER_ID }];
  return Layer.succeed(DbClient, {
    query: {
      organization: {
        findFirst: async () => {
          if (options.orgLookupError) throw options.orgLookupError;
          return org;
        },
      },
      member: { findMany: async () => memberships },
    },
  } as never);
};

const runtimeLayer = (
  seen: AccountDeletionParams[],
  failure?: DeletionRuntimeError
) =>
  Layer.succeed(
    DeletionRuntime,
    DeletionRuntime.of({
      retireLinkProcessor: () => Effect.void,
      retireSyncBackend: () => Effect.void,
      retireChatAgent: () => Effect.void,
      purgeTelegram: () => Effect.void,
      purgeXBookmarkSync: () => Effect.void,
      purgeEnrichmentUsage: () => Effect.void,
      cancelStripeSubscription: () => Effect.void,
      ensureWorkflow: (params) => {
        seen.push(params);
        return failure
          ? Effect.fail(failure)
          : Effect.succeed({ id: WorkflowInstanceId.make(params.orgId) });
      },
    })
  );

const provide = (
  seen: AccountDeletionParams[],
  db: Layer.Layer<DbClient>,
  failure?: DeletionRuntimeError
) => Effect.provide(Layer.mergeAll(db, runtimeLayer(seen, failure)));

describe("prepareDeletion", () => {
  it.effect("passes the validated serializable target to the Workflow", () => {
    const seen: AccountDeletionParams[] = [];
    return prepareDeletion({ userId: USER_ID }).pipe(
      provide(seen, makeDbStub()),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toEqual({
            orgId: ORG_ID,
            workflowInstanceId: ORG_ID,
          });
          expect(seen).toEqual([
            {
              userId: USER_ID,
              orgId: ORG_ID,
              stripeSubscriptionId: StripeSubscriptionId.make("sub-1"),
            },
          ]);
        })
      )
    );
  });

  for (const [name, db] of [
    ["missing personal workspace", makeDbStub({ org: undefined })],
    ["missing owner membership", makeDbStub({ memberships: [] })],
    [
      "non-owner membership",
      makeDbStub({ memberships: [{ role: "member", userId: USER_ID }] }),
    ],
  ] as const) {
    it.effect(`fails loudly for ${name}`, () => {
      const seen: AccountDeletionParams[] = [];
      return prepareDeletion({ userId: USER_ID }).pipe(
        provide(seen, db),
        Effect.result,
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result)) {
              expect(result.failure).toBeInstanceOf(MissingActiveOrgError);
            }
            expect(seen).toEqual([]);
          })
        )
      );
    });
  }

  it.effect(
    "refuses to delete a personal workspace shared with another user",
    () => {
      const seen: AccountDeletionParams[] = [];
      return prepareDeletion({ userId: USER_ID }).pipe(
        provide(
          seen,
          makeDbStub({
            memberships: [
              { role: "owner", userId: USER_ID },
              { role: "member", userId: "user-2" },
            ],
          })
        ),
        Effect.result,
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result)) {
              expect(result.failure).toBeInstanceOf(SharedPersonalOrgError);
            }
            expect(seen).toEqual([]);
          })
        )
      );
    }
  );

  it.effect(
    "propagates Workflow startup failure before identity deletion",
    () => {
      const seen: AccountDeletionParams[] = [];
      const failure = new DeletionRuntimeError({
        op: "ensureWorkflow",
        cause: new Error("Workflows unavailable"),
      });
      return prepareDeletion({ userId: USER_ID }).pipe(
        provide(seen, makeDbStub(), failure),
        Effect.result,
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result)) expect(result.failure).toBe(failure);
            expect(seen).toHaveLength(1);
          })
        )
      );
    }
  );

  it.effect("propagates D1 lookup failures", () => {
    const seen: AccountDeletionParams[] = [];
    return prepareDeletion({ userId: USER_ID }).pipe(
      provide(
        seen,
        makeDbStub({ orgLookupError: new Error("D1 unavailable") })
      ),
      Effect.result,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) {
            expect(result.failure).toBeInstanceOf(DbError);
          }
          expect(seen).toEqual([]);
        })
      )
    );
  });

  for (const [name, org] of [
    ["malformed organization id", { id: null, stripeSubscriptionId: null }],
    [
      "malformed Stripe subscription id",
      { id: ORG_ID, stripeSubscriptionId: 42 },
    ],
  ] as const) {
    it.effect(`rejects ${name} before starting the Workflow`, () => {
      const seen: AccountDeletionParams[] = [];
      return prepareDeletion({ userId: USER_ID }).pipe(
        provide(seen, makeDbStub({ org })),
        Effect.result,
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(Result.isFailure(result)).toBe(true);
            if (Result.isFailure(result)) {
              expect(result.failure).toBeInstanceOf(DbError);
            }
            expect(seen).toEqual([]);
          })
        )
      );
    });
  }
});
