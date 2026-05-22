import { describe, expect, it } from "@effect/vitest";
import { Effect, Either, Layer } from "effect";

import { UserId, WorkflowInstanceId } from "../../db/branded";
import { DbClient, DbError } from "../../db/service";
import { prepareDeletion } from "../prepare";
import { DeletionRuntime, DeletionRuntimeError } from "../runtime";
import type { AccountDeletionParams } from "../runtime";

const USER_ID = UserId.make("user-1");
const ORG_ID = "org-1";

interface DbStubOptions {
  org?: { id: string } | undefined;
  membership?: { role: string } | undefined;
  orgLookupError?: unknown;
  memberLookupError?: unknown;
}

const makeDbStub = (opts: DbStubOptions = {}) => {
  // Use `in` to distinguish "explicitly undefined" (caller wants the absence
  // case) from "not provided" (use the happy-path default).
  const orgRow = "org" in opts ? opts.org : { id: ORG_ID };
  const memberRow = "membership" in opts ? opts.membership : { role: "owner" };
  return Layer.succeed(DbClient, {
    query: {
      organization: {
        findFirst: async () => {
          if (opts.orgLookupError) throw opts.orgLookupError;
          return orgRow;
        },
      },
      member: {
        findFirst: async () => {
          if (opts.memberLookupError) throw opts.memberLookupError;
          return memberRow;
        },
      },
    },
  } as never);
};

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
      purgeXBookmarkSync: () => Effect.void,
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
      provideTestLayers(stubRuntime(rec), makeDbStub()),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(rec.ensures).toHaveLength(1);
          expect(rec.ensures[0]).toMatchObject({
            userId: "user-1",
            orgId: ORG_ID,
          });
          expect(result).toMatchObject({
            orgId: ORG_ID,
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
          makeDbStub()
        ),
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(rec.ensures).toHaveLength(1);
            expect(result?.workflowInstanceId).toBe("wf-existing");
          })
        )
      );
    }
  );
});

describe("prepareDeletion (no purge needed)", () => {
  // These users have nothing tenant-scoped to purge (e.g. their bootstrap
  // createOrganization swallowed an error). Better Auth still removes the
  // user row — we just skip the workflow.
  it.effect("returns null when the personal org doesn't exist", () => {
    const rec: RuntimeRec = { ensures: [] };

    return prepareDeletion({ userId: UserId.make("user-no-org") }).pipe(
      provideTestLayers(stubRuntime(rec), makeDbStub({ org: undefined })),
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(result).toBeNull();
          expect(rec.ensures).toEqual([]);
        })
      )
    );
  });

  it.effect(
    "returns null when the user is not a member of the personal org",
    () => {
      const rec: RuntimeRec = { ensures: [] };

      return prepareDeletion({ userId: USER_ID }).pipe(
        provideTestLayers(
          stubRuntime(rec),
          makeDbStub({ membership: undefined })
        ),
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(result).toBeNull();
            expect(rec.ensures).toEqual([]);
          })
        )
      );
    }
  );

  it.effect(
    "returns null when the user is a non-owner member of the personal org",
    () => {
      // Defense in depth: refuses to purge if the bootstrap ownership
      // invariant doesn't hold for the personal-slug org (it should, but
      // we won't act on a row that doesn't match).
      const rec: RuntimeRec = { ensures: [] };

      return prepareDeletion({ userId: USER_ID }).pipe(
        provideTestLayers(
          stubRuntime(rec),
          makeDbStub({ membership: { role: "member" } })
        ),
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(result).toBeNull();
            expect(rec.ensures).toEqual([]);
          })
        )
      );
    }
  );
});

describe("prepareDeletion (error paths)", () => {
  it.effect("propagates DeletionRuntimeError from ensureWorkflow", () => {
    const rec: RuntimeRec = { ensures: [] };
    const failure = new DeletionRuntimeError({
      op: "ensureWorkflow",
      cause: new Error("CF Workflows down"),
    });

    return prepareDeletion({ userId: USER_ID }).pipe(
      provideTestLayers(stubRuntime(rec, failure), makeDbStub()),
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

  it.effect("propagates DbError from organization lookup", () => {
    const rec: RuntimeRec = { ensures: [] };

    return prepareDeletion({ userId: USER_ID }).pipe(
      provideTestLayers(
        stubRuntime(rec),
        makeDbStub({ orgLookupError: new Error("connection lost") })
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

  it.effect("rejects (as DbError) when org.id fails OrgId decode", () => {
    // Defensive: a corrupted organization row with a non-string id would
    // otherwise silently propagate a fake brand. The Schema decode in
    // prepare.ts catches it before the workflow is spawned.
    const rec: RuntimeRec = { ensures: [] };

    return prepareDeletion({ userId: USER_ID }).pipe(
      provideTestLayers(
        stubRuntime(rec),
        makeDbStub({ org: { id: 42 as unknown as string } })
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
});
