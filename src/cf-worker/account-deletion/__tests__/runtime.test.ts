import { it } from "@effect/vitest";
import { Effect, Layer, Result } from "effect";
import { describe, expect, vi } from "vitest";

import { StripeClientLive } from "../../billing/stripe-client";
import { OrgId, StripeSubscriptionId, UserId } from "../../db/branded";
import type { Env } from "../../shared";
import { TelegramKeyStoreLive } from "../../telegram/services/telegram-key-store.live";
import {
  ACCOUNT_DELETION_RETENTION,
  DeletionRuntime,
  DeletionRuntimeError,
  DeletionRuntimeLayer,
  DeletionRuntimeLive,
} from "../runtime";
import type { AccountDeletionParams } from "../runtime";

const ORG_ID = OrgId.make("org-1");
const USER_ID = UserId.make("user-1");

const baseParams: AccountDeletionParams = {
  userId: USER_ID,
  orgId: ORG_ID,
  stripeSubscriptionId: StripeSubscriptionId.make("sub_1"),
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
  createBatch: ReturnType<typeof vi.fn>;
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
    createBatch: vi.fn(
      async (batch: WorkflowInstanceCreateOptions<AccountDeletionParams>[]) => {
        if (opts.existing) return [];
        const { id } = batch[0]!;
        const newId = opts.createId?.(id ?? "") ?? id ?? "wf-fresh";
        createIds.push(newId);
        return [makeInstance(newId, "queued")];
      }
    ),
    createIds,
  };
};

const makeEnv = (
  overrides: Partial<{
    workflow: FakeWorkflow;
    linkProcessorPurge: ReturnType<typeof vi.fn>;
    syncBackendPurge: ReturnType<typeof vi.fn>;
    chatPurge: ReturnType<typeof vi.fn>;
    xPurge: ReturnType<typeof vi.fn>;
    telegramKv: Map<string, string>;
    enrichmentKv: Map<string, string>;
    enrichmentList: ReturnType<typeof vi.fn>;
  }> = {}
) => {
  const workflow = overrides.workflow ?? fakeWorkflowBinding({});
  const linkProcessorPurge =
    overrides.linkProcessorPurge ?? vi.fn().mockResolvedValue(undefined);
  const syncBackendPurge =
    overrides.syncBackendPurge ?? vi.fn().mockResolvedValue(undefined);
  const chatPurge = overrides.chatPurge ?? vi.fn().mockResolvedValue(undefined);
  const xPurge = overrides.xPurge ?? vi.fn().mockResolvedValue(undefined);

  const linkProcessorIdFromName = vi.fn().mockReturnValue("lp-id");
  const syncBackendIdFromName = vi.fn().mockReturnValue("sb-id");
  const chatIdFromName = vi.fn().mockReturnValue("chat-id");
  const xIdFromName = vi.fn().mockReturnValue("x-id");

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
  const enrichmentKv = overrides.enrichmentKv ?? new Map<string, string>();
  const enrichmentList =
    overrides.enrichmentList ??
    vi.fn(async ({ prefix }: { prefix?: string }) => ({
      keys: [...enrichmentKv.keys()]
        .filter((key) => !prefix || key.startsWith(prefix))
        .map((name) => ({ name })),
      list_complete: true,
    }));
  const ENRICHMENT_USAGE = {
    list: enrichmentList,
    delete: vi.fn(async (key: string) => {
      enrichmentKv.delete(key);
    }),
  };

  return {
    env: {
      ACCOUNT_DELETION: workflow,
      LINK_PROCESSOR_DO: {
        idFromName: linkProcessorIdFromName,
        get: vi.fn().mockReturnValue({
          retire: linkProcessorPurge,
          retireChatSessions: chatPurge,
        }),
      },
      SYNC_BACKEND_DO: {
        idFromName: syncBackendIdFromName,
        get: vi.fn().mockReturnValue({
          purgeAll: syncBackendPurge,
        }),
      },
      Chat: {
        idFromName: chatIdFromName,
        get: vi.fn().mockReturnValue({
          retire: chatPurge,
        }),
      },
      X_BOOKMARK_SYNC_DO: {
        idFromName: xIdFromName,
        get: vi.fn().mockReturnValue({
          disconnect: xPurge,
        }),
      },
      TELEGRAM_KV,
      ENRICHMENT_USAGE,
      STRIPE_API_KEY: "sk_test_delete",
      STRIPE_PRICE_PLUS: "price_plus",
      STRIPE_PRICE_PLUS_YEARLY: "price_plus_year",
      STRIPE_PRICE_PRO: "price_pro",
      STRIPE_PRICE_PRO_YEARLY: "price_pro_year",
    } as unknown as Env,
    workflow,
    linkProcessorIdFromName,
    syncBackendIdFromName,
    chatIdFromName,
    xIdFromName,
    linkProcessorPurge,
    syncBackendPurge,
    chatPurge,
    xPurge,
    telegramKv,
    TELEGRAM_KV,
    enrichmentKv,
    ENRICHMENT_USAGE,
  };
};

const deletionRuntimeLayer = (env: Env, fetchFn: typeof fetch) =>
  DeletionRuntimeLayer(env).pipe(
    Layer.provide(
      Layer.mergeAll(StripeClientLive(env, fetchFn), TelegramKeyStoreLive(env))
    )
  );

describe("DeletionRuntimeLive — DO RPC dispatch", () => {
  it.effect("dispatches every actor retirement", () => {
    const fixture = makeEnv();
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      yield* runtime.retireLinkProcessor(ORG_ID);
      yield* runtime.purgeSyncBackend(ORG_ID);
      yield* runtime.retireChatAgent(ORG_ID);
      yield* runtime.purgeXBookmarkSync(USER_ID);
      expect(fixture.linkProcessorPurge).toHaveBeenCalledOnce();
      expect(fixture.syncBackendPurge).toHaveBeenCalledOnce();
      expect(fixture.chatPurge).toHaveBeenCalledOnce();
      expect(fixture.xPurge).toHaveBeenCalledOnce();
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });

  it.effect("purges only workspace-keyed enrichment usage", () => {
    const fixture = makeEnv({
      enrichmentKv: new Map([
        ["enrichment:org-1:2026-08", "1"],
        ["enrichment:org-1:2026-07", "2"],
        ["enrichment:other:2026-08", "3"],
      ]),
    });
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      yield* runtime.purgeEnrichmentUsage(ORG_ID);
      expect(fixture.enrichmentKv.has("enrichment:org-1:2026-08")).toBe(false);
      expect(fixture.enrichmentKv.has("enrichment:org-1:2026-07")).toBe(false);
      expect(fixture.enrichmentKv.get("enrichment:other:2026-08")).toBe("3");
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });

  it.effect("follows enrichment KV cursors until every page is purged", () => {
    const enrichmentKv = new Map([
      ["enrichment:org-1:2026-08", "1"],
      ["enrichment:org-1:2026-07", "2"],
      ["enrichment:other:2026-08", "3"],
    ]);
    const enrichmentList = vi
      .fn()
      .mockResolvedValueOnce({
        keys: [{ name: "enrichment:org-1:2026-08" }],
        list_complete: false,
        cursor: "next-page",
      })
      .mockResolvedValueOnce({
        keys: [{ name: "enrichment:org-1:2026-07" }],
        list_complete: true,
      });
    const fixture = makeEnv({ enrichmentKv, enrichmentList });

    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      yield* runtime.purgeEnrichmentUsage(ORG_ID);

      expect(enrichmentList).toHaveBeenNthCalledWith(1, {
        prefix: "enrichment:org-1:",
        cursor: undefined,
      });
      expect(enrichmentList).toHaveBeenNthCalledWith(2, {
        prefix: "enrichment:org-1:",
        cursor: "next-page",
      });
      expect(enrichmentKv.has("enrichment:org-1:2026-08")).toBe(false);
      expect(enrichmentKv.has("enrichment:org-1:2026-07")).toBe(false);
      expect(enrichmentKv.get("enrichment:other:2026-08")).toBe("3");
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });

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
        expect(telegramKv.get("telegram-user:other")).toBe("[999]");
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
      op: "retireLinkProcessor" as const,
      method: (rt: typeof DeletionRuntime.Service) =>
        rt.retireLinkProcessor(ORG_ID),
      override: "linkProcessorPurge" as const,
    },
    {
      op: "purgeSyncBackend" as const,
      method: (rt: typeof DeletionRuntime.Service) =>
        rt.purgeSyncBackend(ORG_ID),
      override: "syncBackendPurge" as const,
    },
    {
      op: "retireChatAgent" as const,
      method: (rt: typeof DeletionRuntime.Service) =>
        rt.retireChatAgent(ORG_ID),
      override: "chatPurge" as const,
    },
    {
      op: "purgeXBookmarkSync" as const,
      method: (rt: typeof DeletionRuntime.Service) =>
        rt.purgeXBookmarkSync(USER_ID),
      override: "xPurge" as const,
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
          const result = yield* Effect.result(method(runtime));
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) {
            expect(result.failure).toBeInstanceOf(DeletionRuntimeError);
            expect(result.failure._tag).toBe("DeletionRuntimeError");
            expect(result.failure.op).toBe(op);
            const cause = result.failure.cause;
            expect(cause).toBeInstanceOf(Error);
            if (cause instanceof Error) {
              expect(cause.message).toContain(`${op} boom`);
            }
          }
        }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
      }
    );
  }

  it.effect("maps enrichment KV failures to purgeEnrichmentUsage", () => {
    const fixture = makeEnv();
    fixture.ENRICHMENT_USAGE.list.mockRejectedValueOnce(
      new Error("KV unavailable")
    );
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      const result = yield* Effect.result(runtime.purgeEnrichmentUsage(ORG_ID));
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure.op).toBe("purgeEnrichmentUsage");
      }
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });
});

describe("DeletionRuntimeLive — Stripe cancellation", () => {
  it.effect(
    "dispatches DELETE with the deletion-scoped idempotency key",
    () => {
      const fetchMock = vi.fn(async () =>
        Response.json({
          id: "sub_1",
          object: "subscription",
          status: "canceled",
        })
      );
      const fixture = makeEnv();

      return Effect.gen(function* () {
        const runtime = yield* DeletionRuntime;
        yield* runtime.cancelStripeSubscription(
          StripeSubscriptionId.make("sub_1"),
          ORG_ID
        );

        expect(fetchMock).toHaveBeenCalledOnce();
        const [input, init] = fetchMock.mock.calls[0] as unknown as [
          RequestInfo | URL,
          RequestInit | undefined,
        ];
        const request =
          input instanceof Request ? input : new Request(String(input), init);
        expect(request.method).toBe("DELETE");
        expect(request.url).toContain("/v1/subscriptions/sub_1");
        expect(request.headers.get("idempotency-key")).toBe(
          "account-deletion:org-1"
        );
      }).pipe(Effect.provide(deletionRuntimeLayer(fixture.env, fetchMock)));
    }
  );

  it.effect("maps Stripe rejection to cancelStripeSubscription", () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        { error: { type: "api_error", message: "Stripe unavailable" } },
        { status: 500 }
      )
    );
    const fixture = makeEnv();

    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      const result = yield* Effect.result(
        runtime.cancelStripeSubscription(
          StripeSubscriptionId.make("sub_1"),
          ORG_ID
        )
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure.op).toBe("cancelStripeSubscription");
      }
    }).pipe(Effect.provide(deletionRuntimeLayer(fixture.env, fetchMock)));
  });

  it.effect("treats an already-missing Stripe subscription as canceled", () => {
    const fetchMock = vi.fn(async () =>
      Response.json(
        {
          error: {
            type: "invalid_request_error",
            code: "resource_missing",
            message: "No such subscription: 'sub_1'",
            param: "id",
          },
        },
        { status: 404 }
      )
    );
    const fixture = makeEnv();

    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      yield* runtime.cancelStripeSubscription(
        StripeSubscriptionId.make("sub_1"),
        ORG_ID
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    }).pipe(Effect.provide(deletionRuntimeLayer(fixture.env, fetchMock)));
  });
});

describe("DeletionRuntimeLive.ensureWorkflow", () => {
  it.effect("creates a new instance keyed on organization identity", () => {
    const fixture = makeEnv();
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      const result = yield* runtime.ensureWorkflow(baseParams);
      expect(result.id).toBe("org-1");
      expect(fixture.workflow.createBatch).toHaveBeenCalledOnce();
      expect(ACCOUNT_DELETION_RETENTION).toEqual({
        successRetention: "1 day",
        errorRetention: "3 days",
      });
      expect(fixture.workflow.createBatch).toHaveBeenCalledWith([
        {
          id: "org-1",
          params: baseParams,
          retention: {
            successRetention: "1 day",
            errorRetention: "3 days",
          },
        },
      ]);
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
      expect(calls.status).toBe(1);
      expect(calls.restart).toBe(0);
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });

  for (const status of ["errored", "terminated"] as const) {
    it.effect(`restarts a ${status} instance`, () => {
      const calls: InstanceCalls = { status: 0, restart: 0 };
      const fixture = makeEnv({
        workflow: fakeWorkflowBinding({
          existing: makeInstance("org-1", status, calls),
        }),
      });
      return Effect.gen(function* () {
        const runtime = yield* DeletionRuntime;
        const result = yield* runtime.ensureWorkflow(baseParams);
        expect(result.id).toBe("org-1");
        expect(calls.status).toBe(1);
        expect(calls.restart).toBe(1);
      }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
    });
  }

  it.effect("rejoins complete without repeating destructive work", () => {
    const calls: InstanceCalls = { status: 0, restart: 0 };
    const fixture = makeEnv({
      workflow: fakeWorkflowBinding({
        existing: makeInstance("org-1", "complete", calls),
      }),
    });
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      yield* runtime.ensureWorkflow(baseParams);
      expect(calls.restart).toBe(0);
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

  it.effect("fails closed for an unknown instance status", () => {
    const calls: InstanceCalls = { status: 0, restart: 0 };
    const fixture = makeEnv({
      workflow: fakeWorkflowBinding({
        existing: makeInstance("org-1", "unknown", calls),
      }),
    });
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      const result = yield* Effect.result(runtime.ensureWorkflow(baseParams));
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure.op).toBe("ensureWorkflow");
        expect(result.failure.step).toBe("status");
      }
      expect(calls.restart).toBe(0);
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });

  it.effect("wraps createBatch() failures as DeletionRuntimeError", () => {
    const fixture = makeEnv();
    fixture.workflow.createBatch.mockRejectedValueOnce(
      new Error("CF Workflows API down")
    );
    return Effect.gen(function* () {
      const runtime = yield* DeletionRuntime;
      const result = yield* Effect.result(runtime.ensureWorkflow(baseParams));
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure._tag).toBe("DeletionRuntimeError");
        expect(result.failure.op).toBe("ensureWorkflow");
        expect(result.failure.step).toBe("create");
        const cause = result.failure.cause;
        expect(cause).toBeInstanceOf(Error);
        if (cause instanceof Error) {
          expect(cause.message).toContain("CF Workflows API down");
        }
      }
    }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
  });

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
        const result = yield* Effect.result(runtime.ensureWorkflow(baseParams));
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          expect(result.failure.op).toBe("ensureWorkflow");
          expect(result.failure.step).toBe("status");
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
        const result = yield* Effect.result(runtime.ensureWorkflow(baseParams));
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) {
          expect(result.failure.op).toBe("ensureWorkflow");
          expect(result.failure.step).toBe("restart");
        }
      }).pipe(Effect.provide(DeletionRuntimeLive(fixture.env)));
    }
  );
});
