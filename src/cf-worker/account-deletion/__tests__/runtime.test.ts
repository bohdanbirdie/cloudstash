import { it } from "@effect/vitest";
import { Effect, Either } from "effect";
import { describe, expect, vi } from "vitest";

import { OrgId, UserId } from "../../db/branded";
import type { Env } from "../../shared";
import {
  DeletionRuntime,
  DeletionRuntimeError,
  DeletionRuntimeLive,
} from "../runtime";
import type { AccountDeletionParams } from "../runtime";

const ORG_ID = OrgId.make("org-1");
const USER_ID = UserId.make("user-1");

const baseParams: AccountDeletionParams = {
  userId: USER_ID,
  orgId: ORG_ID,
};

interface InstanceCalls {
  status: number;
  restart: number;
}

const makeInstance = (
  id: string,
  status: string,
  calls: InstanceCalls = { status: 0, restart: 0 }
) => ({
  id,
  status: async () => {
    calls.status += 1;
    return { status };
  },
  restart: async () => {
    calls.restart += 1;
  },
});

interface FakeWorkflow {
  get: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  createIds: string[];
}

const fakeWorkflowBinding = (opts: {
  existing?: ReturnType<typeof makeInstance>;
  createId?: (id: string) => string;
}): FakeWorkflow => {
  const createIds: string[] = [];
  return {
    get: vi.fn(async (id: string) => {
      if (!opts.existing) throw new Error(`no instance with id ${id}`);
      return opts.existing;
    }),
    create: vi.fn(
      async ({
        id,
        params: _params,
      }: {
        id?: string;
        params: AccountDeletionParams;
      }) => {
        const newId = opts.createId?.(id ?? "") ?? id ?? "wf-fresh";
        createIds.push(newId);
        return makeInstance(newId, "queued");
      }
    ),
    createIds,
  };
};

const makeEnv = (
  overrides: Partial<{
    workflow: FakeWorkflow;
    linkProcessorPurge: ReturnType<typeof vi.fn>;
    linkProcessorMarkDeleting: ReturnType<typeof vi.fn>;
    syncBackendPurge: ReturnType<typeof vi.fn>;
    chatPurge: ReturnType<typeof vi.fn>;
    telegramKv: Map<string, string>;
  }> = {}
) => {
  const workflow = overrides.workflow ?? fakeWorkflowBinding({});
  const linkProcessorPurge =
    overrides.linkProcessorPurge ?? vi.fn().mockResolvedValue(undefined);
  const linkProcessorMarkDeleting =
    overrides.linkProcessorMarkDeleting ?? vi.fn().mockResolvedValue(undefined);
  const syncBackendPurge =
    overrides.syncBackendPurge ?? vi.fn().mockResolvedValue(undefined);
  const chatPurge = overrides.chatPurge ?? vi.fn().mockResolvedValue(undefined);

  const linkProcessorIdFromName = vi.fn().mockReturnValue("lp-id");
  const syncBackendIdFromName = vi.fn().mockReturnValue("sb-id");
  const chatIdFromName = vi.fn().mockReturnValue("chat-id");

  const telegramKv = overrides.telegramKv ?? new Map<string, string>();
  const TELEGRAM_KV = {
    get: vi.fn(async (key: string) => telegramKv.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      telegramKv.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      telegramKv.delete(key);
    }),
  };

  return {
    env: {
      ACCOUNT_DELETION: workflow,
      LINK_PROCESSOR_DO: {
        idFromName: linkProcessorIdFromName,
        get: vi.fn().mockReturnValue({
          purgeAll: linkProcessorPurge,
          markDeleting: linkProcessorMarkDeleting,
        }),
      },
      SYNC_BACKEND_DO: {
        idFromName: syncBackendIdFromName,
        get: vi.fn().mockReturnValue({ purgeAll: syncBackendPurge }),
      },
      Chat: {
        idFromName: chatIdFromName,
        get: vi.fn().mockReturnValue({ purgeAll: chatPurge }),
      },
      TELEGRAM_KV,
    } as unknown as Env,
    workflow,
    linkProcessorIdFromName,
    syncBackendIdFromName,
    chatIdFromName,
    linkProcessorPurge,
    linkProcessorMarkDeleting,
    syncBackendPurge,
    chatPurge,
    telegramKv,
    TELEGRAM_KV,
  };
};

describe("DeletionRuntimeLive — DO RPC dispatch", () => {
  it.effect("markLinkProcessorDeleting fetches the right DO id", () => {
    const fixture = makeEnv();
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      yield* runtime.markLinkProcessorDeleting(ORG_ID);
      expect(fixture.linkProcessorIdFromName).toHaveBeenCalledWith("org-1");
      expect(fixture.linkProcessorMarkDeleting).toHaveBeenCalledOnce();
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });

  it.effect(
    "purgeLinkProcessor / purgeSyncBackend / purgeChatAgent dispatch",
    () => {
      const fixture = makeEnv();
      return Effect.gen(function* () {
        const runtime = yield* DeletionRuntime;
        yield* runtime.purgeLinkProcessor(ORG_ID);
        yield* runtime.purgeSyncBackend(ORG_ID);
        yield* runtime.purgeChatAgent(ORG_ID);
        expect(fixture.linkProcessorPurge).toHaveBeenCalledOnce();
        expect(fixture.syncBackendPurge).toHaveBeenCalledOnce();
        expect(fixture.chatPurge).toHaveBeenCalledOnce();
      }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
    }
  );

  it.effect(
    "purgeTelegram wipes every telegram:${chatId} entry from the reverse index",
    () => {
      const telegramKv = new Map<string, string>([
        ["telegram:101", "sk_a"],
        ["telegram:202", "sk_b"],
        // entry belonging to a different user must not be touched
        ["telegram:999", "sk_other"],
        [`telegram-user:${USER_ID}`, JSON.stringify([101, 202])],
        ["telegram-user:other", JSON.stringify([999])],
      ]);
      const fixture = makeEnv({ telegramKv });
      return Effect.gen(function* () {
        const runtime = yield* DeletionRuntime;
        yield* runtime.purgeTelegram(USER_ID, ORG_ID);
        expect(telegramKv.has("telegram:101")).toBe(false);
        expect(telegramKv.has("telegram:202")).toBe(false);
        expect(telegramKv.has(`telegram-user:${USER_ID}`)).toBe(false);
        // other user's entries untouched
        expect(telegramKv.get("telegram:999")).toBe("sk_other");
        expect(telegramKv.get("telegram-user:other")).toBe(
          JSON.stringify([999])
        );
      }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
    }
  );

  it.effect(
    "purgeTelegram is a no-op when the user has no reverse index entry",
    () => {
      const fixture = makeEnv();
      return Effect.gen(function* () {
        const runtime = yield* DeletionRuntime;
        yield* runtime.purgeTelegram(USER_ID, ORG_ID);
        expect(fixture.TELEGRAM_KV.delete).not.toHaveBeenCalledWith(
          expect.stringMatching(/^telegram:/)
        );
      }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
    }
  );
});

describe("DeletionRuntimeLive — DO RPC failure paths", () => {
  const failureCases = [
    {
      op: "markLinkProcessorDeleting" as const,
      method: (rt: typeof DeletionRuntime.Service) =>
        rt.markLinkProcessorDeleting(ORG_ID),
      override: "linkProcessorMarkDeleting" as const,
    },
    {
      op: "purgeLinkProcessor" as const,
      method: (rt: typeof DeletionRuntime.Service) =>
        rt.purgeLinkProcessor(ORG_ID),
      override: "linkProcessorPurge" as const,
    },
    {
      op: "purgeSyncBackend" as const,
      method: (rt: typeof DeletionRuntime.Service) =>
        rt.purgeSyncBackend(ORG_ID),
      override: "syncBackendPurge" as const,
    },
    {
      op: "purgeChatAgent" as const,
      method: (rt: typeof DeletionRuntime.Service) => rt.purgeChatAgent(ORG_ID),
      override: "chatPurge" as const,
    },
  ];

  for (const { op, method, override } of failureCases) {
    it.effect(
      `${op}: wraps DO RPC rejection as DeletionRuntimeError(op=${op})`,
      () => {
        const fixture = makeEnv({
          [override]: vi.fn().mockRejectedValue(new Error(`${op} boom`)),
        });
        return Effect.gen(function* () {
          const runtime = yield* DeletionRuntime;
          const result = yield* Effect.either(method(runtime));
          expect(Either.isLeft(result)).toBe(true);
          if (Either.isLeft(result)) {
            expect(result.left).toBeInstanceOf(DeletionRuntimeError);
            expect(result.left._tag).toBe("DeletionRuntimeError");
            expect(result.left.op).toBe(op);
            const cause = result.left.cause;
            expect(cause).toBeInstanceOf(Error);
            if (cause instanceof Error) {
              expect(cause.message).toContain(`${op} boom`);
            }
          }
        }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
      }
    );
  }
});

describe("DeletionRuntimeLive.ensureWorkflow", () => {
  it.effect("creates a new instance when none exists, keyed on orgId", () => {
    const fixture = makeEnv();
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      const result = yield* runtime.ensureWorkflow(baseParams);
      expect(result.id).toBe("org-1");
      expect(fixture.workflow.create).toHaveBeenCalledOnce();
      expect(fixture.workflow.createIds).toEqual(["org-1"]);
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });

  it.effect("returns the existing instance when active", () => {
    const calls: InstanceCalls = { status: 0, restart: 0 };
    const fixture = makeEnv({
      workflow: fakeWorkflowBinding({
        existing: makeInstance("org-1", "running", calls),
      }),
    });
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      const result = yield* runtime.ensureWorkflow(baseParams);
      expect(result.id).toBe("org-1");
      expect(fixture.workflow.create).not.toHaveBeenCalled();
      expect(calls.status).toBe(1);
      expect(calls.restart).toBe(0);
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });

  it.effect("restarts when status is terminal (errored)", () => {
    const calls: InstanceCalls = { status: 0, restart: 0 };
    const fixture = makeEnv({
      workflow: fakeWorkflowBinding({
        existing: makeInstance("org-1", "errored", calls),
      }),
    });
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      const result = yield* runtime.ensureWorkflow(baseParams);
      expect(result.id).toBe("org-1");
      expect(calls.status).toBe(1);
      expect(calls.restart).toBe(1);
      expect(fixture.workflow.create).not.toHaveBeenCalled();
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });

  it.effect("restarts when status is 'complete' (within retention)", () => {
    const calls: InstanceCalls = { status: 0, restart: 0 };
    const fixture = makeEnv({
      workflow: fakeWorkflowBinding({
        existing: makeInstance("org-1", "complete", calls),
      }),
    });
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      yield* runtime.ensureWorkflow(baseParams);
      expect(calls.restart).toBe(1);
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });

  it.effect(
    "returns existing for paused / queued / waiting / waitingForPause",
    () => {
      const inputs = ["queued", "paused", "waiting", "waitingForPause"];
      return Effect.gen(function* () {
        for (const status of inputs) {
          const calls: InstanceCalls = { status: 0, restart: 0 };
          const fixture = makeEnv({
            workflow: fakeWorkflowBinding({
              existing: makeInstance("org-1", status, calls),
            }),
          });
          const result = yield* Effect.gen(function* () {
            const runtime = yield* DeletionRuntime;
            return yield* runtime.ensureWorkflow(baseParams);
          }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
          expect(result.id).toBe("org-1");
          expect(calls.restart).toBe(0);
        }
      });
    }
  );

  it.effect("wraps create() failures as DeletionRuntimeError", () => {
    const fixture = makeEnv();
    fixture.workflow.create.mockRejectedValueOnce(
      new Error("CF Workflows API down")
    );
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      const result = yield* Effect.either(runtime.ensureWorkflow(baseParams));
      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left._tag).toBe("DeletionRuntimeError");
        expect(result.left.op).toBe("ensureWorkflow");
        expect(result.left.step).toBe("create");
        const cause = result.left.cause;
        expect(cause).toBeInstanceOf(Error);
        if (cause instanceof Error) {
          expect(cause.message).toContain("CF Workflows API down");
        }
      }
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });

  it.effect(
    "any get() failure falls through to create() (no string-sniff)",
    () => {
      const fixture = makeEnv();
      fixture.workflow.get.mockRejectedValueOnce(
        new Error("instance.not_found")
      );
      return Effect.gen(function* () {
        const runtime = yield* DeletionRuntime;
        const result = yield* runtime.ensureWorkflow(baseParams);
        expect(result.id).toBe("org-1");
        expect(fixture.workflow.create).toHaveBeenCalledOnce();
      }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
    }
  );

  it.effect(
    "wraps status() failures as DeletionRuntimeError(step=status)",
    () => {
      const calls: InstanceCalls = { status: 0, restart: 0 };
      const existing = makeInstance("org-1", "running", calls);
      existing.status = vi
        .fn()
        .mockRejectedValueOnce(new Error("status check timed out"));
      const fixture = makeEnv({
        workflow: fakeWorkflowBinding({ existing }),
      });
      return Effect.gen(function* () {
        const runtime = yield* DeletionRuntime;
        const result = yield* Effect.either(runtime.ensureWorkflow(baseParams));
        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left.op).toBe("ensureWorkflow");
          expect(result.left.step).toBe("status");
        }
      }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
    }
  );

  it.effect(
    "wraps restart() failures as DeletionRuntimeError(step=restart)",
    () => {
      const calls: InstanceCalls = { status: 0, restart: 0 };
      const existing = makeInstance("org-1", "errored", calls);
      existing.restart = vi
        .fn()
        .mockRejectedValueOnce(new Error("restart not allowed"));
      const fixture = makeEnv({
        workflow: fakeWorkflowBinding({ existing }),
      });
      return Effect.gen(function* () {
        const runtime = yield* DeletionRuntime;
        const result = yield* Effect.either(runtime.ensureWorkflow(baseParams));
        expect(Either.isLeft(result)).toBe(true);
        if (Either.isLeft(result)) {
          expect(result.left.op).toBe("ensureWorkflow");
          expect(result.left.step).toBe("restart");
        }
      }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
    }
  );
});
