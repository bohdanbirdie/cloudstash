import { it } from "@effect/vitest";
import { Effect, Either, Layer } from "effect";
import { describe, expect } from "vitest";

import { UserId, WorkflowInstanceId } from "../../db/branded";
import { DbClient, DbError } from "../../db/service";
import { MissingActiveOrgError, prepareDeletion } from "../prepare";
import { DeletionRuntime, DeletionRuntimeError } from "../runtime";
import type { AccountDeletionParams } from "../runtime";

const USER_ID = UserId.make("user-1");

const makeDbStub = (
  membership: { organizationId: string } | undefined,
  memberLookupError?: unknown
) =>
  Layer.succeed(DbClient, {
    query: {
      member: {
        findFirst: async () => {
          if (memberLookupError) throw memberLookupError;
          return membership;
        },
      },
    },
  } as never);

interface RuntimeRec {
  ensures: AccountDeletionParams[];
}

const stubRuntime = (
  rec: RuntimeRec,
  result: { id: WorkflowInstanceId } | DeletionRuntimeError = {
    id: WorkflowInstanceId.make("wf-fresh"),
  }
) =>
  Layer.succeed(
    DeletionRuntime,
    DeletionRuntime.of({
      markLinkProcessorDeleting: () => Effect.void,
      purgeLinkProcessor: () => Effect.void,
      purgeSyncBackend: () => Effect.void,
      purgeChatAgent: () => Effect.void,
      purgeTelegram: () => Effect.void,
      ensureWorkflow: (params) => {
        rec.ensures.push(params);
        return result instanceof DeletionRuntimeError
          ? Effect.fail(result)
          : Effect.succeed(result);
      },
    })
  );

const provideTestLayers = (
  runtime: Layer.Layer<DeletionRuntime>,
  db: Layer.Layer<DbClient>
) => Effect.provide(Layer.mergeAll(runtime, db));

describe("prepareDeletion (happy path)", () => {
  it.effect("resolves orgId and returns the workflow handle", () => {
    const rec: RuntimeRec = { ensures: [] };

    return prepareDeletion({ userId: USER_ID }).pipe(
      provideTestLayers(
        stubRuntime(rec),
        makeDbStub({ organizationId: "org-1" })
      ),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(rec.ensures).toHaveLength(1);
          expect(rec.ensures[0]).toMatchObject({
            userId: "user-1",
            orgId: "org-1",
          });
          expect(result).toMatchObject({
            orgId: "org-1",
            workflowInstanceId: "wf-fresh",
          });
        })
      )
    );
  });
});

describe("prepareDeletion (idempotency)", () => {
  it.effect(
    "delegates to runtime.ensureWorkflow — no D1 lookup, no insert",
    () => {
      // Idempotency lives entirely inside `ensureWorkflow` (orgId IS the workflow
      // id, so retries pick up the existing instance via CF's `get(orgId)`).
      // From `prepareDeletion`'s perspective, every call is identical: resolve
      // org, ensure workflow.
      const rec: RuntimeRec = { ensures: [] };

      return prepareDeletion({ userId: USER_ID }).pipe(
        provideTestLayers(
          stubRuntime(rec, { id: WorkflowInstanceId.make("wf-existing") }),
          makeDbStub({ organizationId: "org-1" })
        ),
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(rec.ensures).toHaveLength(1);
            expect(result.workflowInstanceId).toBe("wf-existing");
          })
        )
      );
    }
  );
});

describe("prepareDeletion (error paths)", () => {
  it.effect(
    "fails with MissingActiveOrgError when the user has no membership",
    () => {
      const rec: RuntimeRec = { ensures: [] };

      return prepareDeletion({ userId: UserId.make("user-no-org") }).pipe(
        provideTestLayers(stubRuntime(rec), makeDbStub(undefined)),
        Effect.either,
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(Either.isLeft(result)).toBe(true);
            if (Either.isLeft(result)) {
              expect(result.left).toBeInstanceOf(MissingActiveOrgError);
            }
            expect(rec.ensures).toEqual([]);
          })
        )
      );
    }
  );

  it.effect("propagates DeletionRuntimeError from ensureWorkflow", () => {
    const rec: RuntimeRec = { ensures: [] };
    const failure = new DeletionRuntimeError({
      op: "ensureWorkflow",
      cause: new Error("CF Workflows down"),
    });

    return prepareDeletion({ userId: USER_ID }).pipe(
      provideTestLayers(
        stubRuntime(rec, failure),
        makeDbStub({ organizationId: "org-1" })
      ),
      Effect.either,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left).toBeInstanceOf(DeletionRuntimeError);
          }
        })
      )
    );
  });

  it.effect("propagates DbError from member lookup", () => {
    const rec: RuntimeRec = { ensures: [] };

    return prepareDeletion({ userId: USER_ID }).pipe(
      provideTestLayers(
        stubRuntime(rec),
        makeDbStub(undefined, new Error("connection lost"))
      ),
      Effect.either,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left).toBeInstanceOf(DbError);
          }
          expect(rec.ensures).toEqual([]);
        })
      )
    );
  });

  it.effect(
    "rejects (as DbError) when membership.organizationId fails OrgId decode",
    () => {
      // Defensive: a corrupted member row with a non-string organizationId
      // would otherwise silently propagate a fake brand. The Schema decode
      // at prepare.ts catches it before the workflow is spawned.
      const rec: RuntimeRec = { ensures: [] };

      return prepareDeletion({ userId: USER_ID }).pipe(
        provideTestLayers(
          stubRuntime(rec),
          makeDbStub({ organizationId: 42 as unknown as string })
        ),
        Effect.either,
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(Either.isLeft(result)).toBe(true);
            if (Either.isLeft(result)) {
              expect(result.left).toBeInstanceOf(DbError);
            }
            expect(rec.ensures).toEqual([]);
          })
        )
      );
    }
  );
});
