import { it } from "@effect/vitest";
import { Effect, Either, Layer } from "effect";
import { describe, expect, vi } from "vitest";

import { OrgId, UserId } from "../../db/branded";
import { DbClient } from "../../db/service";
import { DeletionRuntime, DeletionRuntimeError } from "../runtime";
import type { AccountDeletionParams } from "../runtime";
import { CfStep, runAccountDeletion } from "../workflow";
import type { CfWorkflowStep } from "../workflow";

const payload: AccountDeletionParams = {
  userId: UserId.make("user-1"),
  orgId: OrgId.make("org-1"),
};

interface StepCall {
  name: string;
}

const makeStep = (opts: { failOn?: string } = {}) => {
  const calls: StepCall[] = [];
  const cf: CfWorkflowStep = {
    do: vi.fn(
      async (
        name: string,
        configOrFn: unknown,
        maybeFn?: () => Promise<unknown>
      ): Promise<unknown> => {
        const body =
          typeof configOrFn === "function"
            ? (configOrFn as () => Promise<unknown>)
            : (maybeFn as () => Promise<unknown>);
        calls.push({ name });
        if (opts.failOn === name) {
          throw new Error(`step ${name} failed`);
        }
        return body();
      }
    ),
  };
  return { step: cf, calls };
};

interface DbRec {
  deletes: number;
}

const stubDbLayer = (rec: DbRec) =>
  Layer.succeed(DbClient, {
    delete: () => ({
      where: async () => {
        rec.deletes += 1;
      },
    }),
  } as never);

interface RuntimeRec {
  purgeTelegram: number;
  purgeXBookmarkSync: number;
  markLinkProcessorDeleting: number;
  purgeLinkProcessor: number;
  purgeSyncBackend: number;
  purgeChatAgent: number;
}

type RuntimeMethod = keyof RuntimeRec;

const stubRuntime = (rec: RuntimeRec, failOn?: RuntimeMethod) => {
  const method = (key: RuntimeMethod) =>
    Effect.suspend(() => {
      rec[key] += 1;
      if (failOn === key) {
        return Effect.fail(
          new DeletionRuntimeError({
            op: key,
            cause: new Error(`${key} boom`),
          })
        );
      }
      return Effect.void;
    });
  return Layer.succeed(
    DeletionRuntime,
    DeletionRuntime.of({
      markLinkProcessorDeleting: () => method("markLinkProcessorDeleting"),
      purgeLinkProcessor: () => method("purgeLinkProcessor"),
      purgeSyncBackend: () => method("purgeSyncBackend"),
      purgeChatAgent: () => method("purgeChatAgent"),
      purgeTelegram: () => method("purgeTelegram"),
      purgeXBookmarkSync: () => method("purgeXBookmarkSync"),
      ensureWorkflow: () =>
        Effect.fail(
          new DeletionRuntimeError({
            op: "ensureWorkflow",
            cause: new Error("not used in workflow tests"),
          })
        ),
    })
  );
};

const newRuntimeRec = (): RuntimeRec => ({
  purgeTelegram: 0,
  purgeXBookmarkSync: 0,
  markLinkProcessorDeleting: 0,
  purgeLinkProcessor: 0,
  purgeSyncBackend: 0,
  purgeChatAgent: 0,
});

const provideTestLayers = (
  runtime: Layer.Layer<DeletionRuntime>,
  db: Layer.Layer<DbClient>,
  cfStep: CfWorkflowStep
) => Effect.provide(Layer.mergeAll(runtime, db, Layer.succeed(CfStep, cfStep)));

const EXPECTED_STEPS = [
  "mark-link-processor-deleting",
  "wipe-link-processor",
  "wipe-sync-backend",
  "wipe-chat-agent",
  "purge-telegram",
  "purge-x-bookmark-sync",
  "delete-org",
] as const;

describe("runAccountDeletion (happy path)", () => {
  it.effect("invokes steps in the documented order", () => {
    const { step, calls } = makeStep();
    const dbRec: DbRec = { deletes: 0 };
    const rec = newRuntimeRec();

    return runAccountDeletion(payload).pipe(
      provideTestLayers(stubRuntime(rec), stubDbLayer(dbRec), step),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(calls.map((c) => c.name)).toEqual(EXPECTED_STEPS);
        })
      )
    );
  });

  it.effect("invokes runtime methods exactly once each", () => {
    const { step } = makeStep();
    const dbRec: DbRec = { deletes: 0 };
    const rec = newRuntimeRec();

    return runAccountDeletion(payload).pipe(
      provideTestLayers(stubRuntime(rec), stubDbLayer(dbRec), step),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(rec).toEqual({
            purgeTelegram: 1,
            purgeXBookmarkSync: 1,
            markLinkProcessorDeleting: 1,
            purgeLinkProcessor: 1,
            purgeSyncBackend: 1,
            purgeChatAgent: 1,
          });
          expect(dbRec.deletes).toBe(1);
        })
      )
    );
  });
});

describe("runAccountDeletion (failure path)", () => {
  it.effect(
    "on a step throwing: tags WorkflowOrchestrationError with step name + cause",
    () => {
      const { step, calls } = makeStep({ failOn: "wipe-sync-backend" });
      const dbRec: DbRec = { deletes: 0 };

      return runAccountDeletion(payload).pipe(
        provideTestLayers(
          stubRuntime(newRuntimeRec()),
          stubDbLayer(dbRec),
          step
        ),
        Effect.either,
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(Either.isLeft(result)).toBe(true);
            if (Either.isLeft(result)) {
              const error = result.left;
              expect(error._tag).toBe("WorkflowOrchestrationError");
              expect(error.step).toBe("wipe-sync-backend");
              expect(String(error.cause)).toContain(
                "step wipe-sync-backend failed"
              );
            }
            // Stops at the failing step — no later steps run.
            expect(calls.map((c) => c.name)).toEqual([
              "mark-link-processor-deleting",
              "wipe-link-processor",
              "wipe-sync-backend",
            ]);
            expect(dbRec.deletes).toBe(0);
          })
        )
      );
    }
  );

  it.effect(
    "on a runtime method failing: error surfaces from the step that fired it",
    () => {
      const { step, calls } = makeStep();
      const dbRec: DbRec = { deletes: 0 };

      return runAccountDeletion(payload).pipe(
        provideTestLayers(
          stubRuntime(newRuntimeRec(), "purgeChatAgent"),
          stubDbLayer(dbRec),
          step
        ),
        Effect.either,
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(Either.isLeft(result)).toBe(true);
            if (Either.isLeft(result)) {
              const error = result.left;
              expect(error._tag).toBe("WorkflowOrchestrationError");
              expect(error.step).toBe("wipe-chat-agent");
              expect(String(error.cause)).toContain("purgeChatAgent boom");
            }
            expect(calls.map((c) => c.name)).toEqual([
              "mark-link-processor-deleting",
              "wipe-link-processor",
              "wipe-sync-backend",
              "wipe-chat-agent",
            ]);
            expect(dbRec.deletes).toBe(0);
          })
        )
      );
    }
  );

  it.effect(
    "purgeXBookmarkSync failure: tags step purge-x-bookmark-sync, delete-org never runs",
    () => {
      const { step, calls } = makeStep();
      const dbRec: DbRec = { deletes: 0 };

      return runAccountDeletion(payload).pipe(
        provideTestLayers(
          stubRuntime(newRuntimeRec(), "purgeXBookmarkSync"),
          stubDbLayer(dbRec),
          step
        ),
        Effect.either,
        Effect.tap((result) =>
          Effect.sync(() => {
            expect(Either.isLeft(result)).toBe(true);
            if (Either.isLeft(result)) {
              const error = result.left;
              expect(error._tag).toBe("WorkflowOrchestrationError");
              expect(error.step).toBe("purge-x-bookmark-sync");
              expect(String(error.cause)).toContain("purgeXBookmarkSync boom");
            }
            expect(calls.map((c) => c.name)).toEqual([
              "mark-link-processor-deleting",
              "wipe-link-processor",
              "wipe-sync-backend",
              "wipe-chat-agent",
              "purge-telegram",
              "purge-x-bookmark-sync",
            ]);
            expect(dbRec.deletes).toBe(0);
          })
        )
      );
    }
  );
});
