import { describe, expect, it } from "@effect/vitest";
import {
  createExecutionContext,
  createScheduledController,
  env,
  evictDurableObject,
  runInDurableObject,
  runDurableObjectAlarm,
  SELF,
  waitOnExecutionContext,
} from "cloudflare:test";
import { Effect, Schema } from "effect";
import { afterEach } from "vitest";

import { scheduled } from "../../index";
import type { XBookmarkSyncDO } from "../../x-sync";
import { X_API_CLIENT_TEST_OVERRIDE } from "../../x-sync/durable-object";
import type { XApiFailure } from "../../x-sync/errors";
import { XApiError, XRateLimitedError } from "../../x-sync/errors";
import type { BookmarksPage as BookmarksPageType } from "../../x-sync/services";
import { BookmarksPage, XApiClient } from "../../x-sync/services";
import { makeAdmin, signupUser } from "./helpers";

const WATERMARK = "bookmark-before-reconciliation";
const MINUTE = 60_000;

interface XResponsePlan {
  readonly body?: unknown;
  readonly retryAfterMs?: number;
  readonly status: number;
}

let xResponsePlan: XResponsePlan | undefined;
let xRequestCount = 0;

const planBookmarksResponse = (plan: XResponsePlan) => {
  xResponsePlan = plan;
  xRequestCount = 0;
};

const testXApiClient = XApiClient.of({
  getMe: () => Effect.die("Unexpected XApiClient.getMe call"),
  getBookmarks: () =>
    Effect.suspend((): Effect.Effect<BookmarksPageType, XApiFailure> => {
      if (xResponsePlan === undefined) {
        return Effect.die("Unplanned XApiClient.getBookmarks call");
      }
      const plan = xResponsePlan;
      xRequestCount += 1;
      if (plan.status === 429) {
        return Effect.fail(
          new XRateLimitedError({
            endpoint: "bookmarks",
            retryAfterMs: plan.retryAfterMs ?? 60_000,
          })
        );
      }
      if (plan.status < 200 || plan.status >= 300) {
        return Effect.fail(
          new XApiError({
            endpoint: "bookmarks",
            message: `HTTP ${plan.status}`,
            status: plan.status,
          })
        );
      }
      return Schema.decodeUnknownEffect(BookmarksPage)(plan.body ?? {}).pipe(
        Effect.orDie
      );
    }),
});

const installXProviderService = (
  stub: DurableObjectStub<XBookmarkSyncDO>
): Promise<void> =>
  runInDurableObject(stub, (instance) =>
    instance[X_API_CLIENT_TEST_OVERRIDE](testXApiClient)
  );

interface ObservedXState {
  readonly alarm: number | null;
  readonly status: string | undefined;
  readonly syncEnabled: boolean | undefined;
  readonly watermark: string | undefined;
}

interface ObservedPollSchedule {
  readonly alarm: number | null;
  readonly pollControl: unknown;
  readonly watermark: string | undefined;
}

const observe = (
  stub: DurableObjectStub<XBookmarkSyncDO>
): Promise<ObservedXState> =>
  runInDurableObject(stub, async (_instance, state) => {
    const storage = state.storage;
    return {
      alarm: await storage.getAlarm(),
      status: await storage.get<string>("status"),
      syncEnabled: await storage.get<boolean>("syncEnabled"),
      watermark: await storage.get<string>("watermark"),
    };
  });

const observePollSchedule = (
  stub: DurableObjectStub<XBookmarkSyncDO>
): Promise<ObservedPollSchedule> =>
  runInDurableObject(stub, async (_instance, state) => ({
    alarm: await state.storage.getAlarm(),
    pollControl: await state.storage.get("pollControl"),
    watermark: await state.storage.get<string>("watermark"),
  }));

const waitForState = (
  stub: DurableObjectStub<XBookmarkSyncDO>,
  predicate: (state: ObservedXState) => boolean
): Promise<ObservedXState> => {
  const deadline = Date.now() + 10_000;

  return (async () => {
    while (Date.now() < deadline) {
      const state = await observe(stub);
      if (predicate(state)) return state;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error("Timed out waiting for X reconciliation state");
  })();
};

const createLinkedPoller = async (options: {
  readonly alarm: boolean;
  readonly label: string;
}) => {
  const user = await signupUser(
    `x-reconciliation-${options.label}-${crypto.randomUUID()}@test.com`,
    `X Reconciliation ${options.label}`
  );
  const stub = env.X_BOOKMARK_SYNC_DO.get(
    env.X_BOOKMARK_SYNC_DO.idFromName(user.userId)
  );
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO account
      (id, account_id, provider_id, user_id, issuer, access_token, created_at, updated_at)
     VALUES (?, ?, 'x', ?, 'test:x', 'test-x-access-token', ?, ?)`
  )
    .bind(
      `x-row-${user.userId}`,
      `x-subject-${user.userId}`,
      user.userId,
      now,
      now
    )
    .run();

  await env.DB.prepare(
    "UPDATE organization SET tier = 'free', admin_tier_grant = 'pro', admin_tier_granted_at = ? WHERE id = ?"
  )
    .bind(now, user.orgId)
    .run();

  await runInDurableObject(stub, async (_instance, state) => {
    const storage = state.storage;
    await storage.put({
      organizationId: user.orgId,
      status: "active",
      syncEnabled: true,
      watermark: WATERMARK,
      xUserId: "x-user-e2e",
      xUsername: "e2e-user",
    });
    if (options.alarm) await storage.setAlarm(Date.now() + 30_000);
  });
  await installXProviderService(stub);

  return { stub, user };
};

const setTier = async (
  orgId: string,
  cookie: string,
  tier: "free" | "pro"
): Promise<void> => {
  const response = await SELF.fetch(`http://worker/api/org/${orgId}/tier`, {
    body: JSON.stringify({ tier }),
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    method: "PUT",
  });
  expect(response.status).toBe(200);
};

describe("X reconciliation E2E", () => {
  afterEach(() => {
    xResponsePlan = undefined;
    xRequestCount = 0;
  });

  it("cleans itself up when delayed reconciliation finds no X account", async () => {
    const { stub, user } = await createLinkedPoller({
      alarm: true,
      label: "deleted",
    });
    await env.DB.prepare("DELETE FROM account WHERE user_id = ?")
      .bind(user.userId)
      .run();
    await stub.disconnect();
    await evictDurableObject(stub);

    const fresh = env.X_BOOKMARK_SYNC_DO.get(
      env.X_BOOKMARK_SYNC_DO.idFromName(user.userId)
    );
    await expect(fresh.pause()).resolves.toBeUndefined();
    await expect(fresh.resume(user.orgId)).resolves.toBeUndefined();
    await expect(fresh.start()).resolves.toBeUndefined();
    await expect(fresh.reconcile(user.orgId)).resolves.toBeUndefined();
    expect(await observe(fresh)).toEqual({
      alarm: null,
      status: undefined,
      syncEnabled: undefined,
      watermark: undefined,
    });
  });

  it("carries an admin plan change through Queue to the poller", async () => {
    const { stub, user } = await createLinkedPoller({
      alarm: true,
      label: "entitlement",
    });
    await makeAdmin(user.userId);
    await env.DB.prepare(
      "UPDATE organization SET tier = 'free', admin_tier_grant = 'pro', admin_tier_granted_at = ? WHERE id = ?"
    )
      .bind(Date.now(), user.orgId)
      .run();

    await setTier(user.orgId, user.cookie, "free");

    const suspended = await waitForState(
      stub,
      (state) => state.status === "suspended" && state.alarm === null
    );
    expect(suspended).toEqual({
      alarm: null,
      status: "suspended",
      syncEnabled: true,
      watermark: WATERMARK,
    });

    await setTier(user.orgId, user.cookie, "pro");
    const restored = await waitForState(
      stub,
      (state) => state.status === "active" && state.alarm !== null
    );
    expect(restored.syncEnabled).toBe(true);
    expect(restored.watermark).toBe(WATERMARK);
  });

  it("carries the scheduled repair through Queue and restores a missing alarm", async () => {
    const { stub } = await createLinkedPoller({
      alarm: false,
      label: "repair",
    });
    expect((await observe(stub)).alarm).toBeNull();

    const controller = createScheduledController({
      cron: "17 4 * * *",
      scheduledTime: new Date(),
    });
    const ctx = createExecutionContext();
    scheduled(controller, env, ctx);
    await waitOnExecutionContext(ctx);

    const repaired = await waitForState(
      stub,
      (state) => state.status === "active" && state.alarm !== null
    );
    expect(repaired.status).toBe("active");
    expect(repaired.alarm).not.toBeNull();
    expect(repaired.syncEnabled).toBe(true);
    expect(repaired.watermark).toBe(WATERMARK);
  });

  it("preserves idle cadence across eviction and missing-alarm repair", async () => {
    const { stub, user } = await createLinkedPoller({
      alarm: false,
      label: "idle-cold-start",
    });
    const pollControl = {
      idleSinceMs: Date.now() - 7 * 60 * 60_000,
      transientFailures: 0,
    };
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.put("pollControl", pollControl);
    });
    await evictDurableObject(stub);

    const fresh = env.X_BOOKMARK_SYNC_DO.get(
      env.X_BOOKMARK_SYNC_DO.idFromName(user.userId)
    );
    const scheduledFrom = Date.now();
    await fresh.reconcile(user.orgId);
    const observed = await observePollSchedule(fresh);

    expect(observed.pollControl).toEqual(pollControl);
    expect(observed.watermark).toBe(WATERMARK);
    expect(observed.alarm).not.toBeNull();
    expect(observed.alarm!).toBeGreaterThanOrEqual(scheduledFrom + 5 * 60_000);
    expect(observed.alarm!).toBeLessThanOrEqual(Date.now() + 5 * 60_000);
  });

  it("preserves transient backoff across eviction and missing-alarm repair", async () => {
    const { stub, user } = await createLinkedPoller({
      alarm: false,
      label: "failure-cold-start",
    });
    const pollControl = {
      idleSinceMs: Date.now() - 7 * 60 * 60_000,
      transientFailures: 4,
    };
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.put("pollControl", pollControl);
    });
    await evictDurableObject(stub);

    const fresh = env.X_BOOKMARK_SYNC_DO.get(
      env.X_BOOKMARK_SYNC_DO.idFromName(user.userId)
    );
    const scheduledFrom = Date.now();
    await fresh.reconcile(user.orgId);
    const observed = await observePollSchedule(fresh);

    expect(observed.pollControl).toEqual(pollControl);
    expect(observed.watermark).toBe(WATERMARK);
    expect(observed.alarm).not.toBeNull();
    expect(observed.alarm!).toBeGreaterThanOrEqual(scheduledFrom + 8 * 60_000);
    expect(observed.alarm!).toBeLessThanOrEqual(Date.now() + 8 * 60_000);
  });

  it("rechecks entitlement before an alarm polls X", async () => {
    const { stub, user } = await createLinkedPoller({
      alarm: true,
      label: "alarm",
    });

    await env.DB.prepare(
      "UPDATE organization SET tier = 'free', admin_tier_grant = NULL, admin_tier_granted_at = NULL WHERE id = ?"
    )
      .bind(user.orgId)
      .run();

    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await observe(stub)).toEqual({
      alarm: null,
      status: "suspended",
      syncEnabled: true,
      watermark: WATERMARK,
    });
  });

  it("runs the real alarm handler and preserves the relaxed idle cadence", async () => {
    const { stub } = await createLinkedPoller({
      alarm: true,
      label: "alarm-idle",
    });
    const pollControl = {
      idleSinceMs: Date.now() - 7 * 60 * MINUTE,
      transientFailures: 0,
    };
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.put("pollControl", pollControl);
    });
    planBookmarksResponse({
      body: {
        data: [
          {
            author_id: "x-user-e2e",
            id: WATERMARK,
            text: "existing bookmark",
          },
        ],
      },
      status: 200,
    });

    const scheduledFrom = Date.now();
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const observed = await observePollSchedule(stub);

    expect(xRequestCount).toBe(1);
    expect(observed.pollControl).toEqual(pollControl);
    expect(observed.alarm).not.toBeNull();
    expect(observed.alarm!).toBeGreaterThanOrEqual(scheduledFrom + 5 * MINUTE);
    expect(observed.alarm!).toBeLessThanOrEqual(Date.now() + 5 * MINUTE);
  });

  it("runs the real alarm handler and persists transient backoff", async () => {
    const { stub } = await createLinkedPoller({
      alarm: true,
      label: "alarm-failure",
    });
    planBookmarksResponse({ status: 500 });

    const scheduledFrom = Date.now();
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const observed = await observePollSchedule(stub);

    expect(xRequestCount).toBe(1);
    expect(observed.pollControl).toEqual({
      idleSinceMs: null,
      transientFailures: 1,
    });
    expect(observed.alarm).not.toBeNull();
    expect(observed.alarm!).toBeGreaterThanOrEqual(scheduledFrom + MINUTE);
    expect(observed.alarm!).toBeLessThanOrEqual(Date.now() + MINUTE);
  });

  it("runs the real alarm handler and honors X rate-limit timing", async () => {
    const { stub } = await createLinkedPoller({
      alarm: true,
      label: "alarm-rate-limit",
    });
    planBookmarksResponse({
      retryAfterMs: 45_000,
      status: 429,
    });

    const scheduledFrom = Date.now();
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const observed = await observePollSchedule(stub);

    expect(xRequestCount).toBe(1);
    expect(observed.pollControl).toBeUndefined();
    expect(observed.alarm).not.toBeNull();
    expect(observed.alarm!).toBeGreaterThanOrEqual(scheduledFrom + 46_000);
    expect(observed.alarm!).toBeLessThanOrEqual(Date.now() + 46_000);
  });

  it("does not let a rate limit accelerate an idle poller", async () => {
    const { stub } = await createLinkedPoller({
      alarm: true,
      label: "alarm-idle-rate-limit",
    });
    const pollControl = {
      idleSinceMs: Date.now() - 7 * 60 * MINUTE,
      transientFailures: 0,
    };
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.put("pollControl", pollControl);
    });
    planBookmarksResponse({
      retryAfterMs: 45_000,
      status: 429,
    });

    const scheduledFrom = Date.now();
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const observed = await observePollSchedule(stub);

    expect(xRequestCount).toBe(1);
    expect(observed.pollControl).toEqual(pollControl);
    expect(observed.alarm).not.toBeNull();
    expect(observed.alarm!).toBeGreaterThanOrEqual(scheduledFrom + 5 * MINUTE);
    expect(observed.alarm!).toBeLessThanOrEqual(Date.now() + 5 * MINUTE);
  });

  it("resets an idle poller after the real alarm finds activity", async () => {
    const { stub } = await createLinkedPoller({
      alarm: true,
      label: "alarm-activity",
    });
    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.put("pollControl", {
        idleSinceMs: Date.now() - 7 * 60 * MINUTE,
        transientFailures: 0,
      });
    });
    planBookmarksResponse({
      body: {
        data: [
          {
            author_id: "x-user-e2e",
            id: "new-bookmark-after-idle",
            text: "new bookmark",
          },
        ],
      },
      status: 200,
    });

    const scheduledFrom = Date.now();
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const observed = await observePollSchedule(stub);

    expect(xRequestCount).toBe(1);
    expect(observed.pollControl).toEqual({
      idleSinceMs: null,
      transientFailures: 0,
    });
    expect(observed.watermark).toBe("new-bookmark-after-idle");
    expect(observed.alarm).not.toBeNull();
    expect(observed.alarm!).toBeGreaterThanOrEqual(scheduledFrom + 30_000);
    expect(observed.alarm!).toBeLessThanOrEqual(Date.now() + 30_000);
  });
});
