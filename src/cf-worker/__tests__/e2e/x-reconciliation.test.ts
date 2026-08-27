import { describe, expect, it } from "@effect/vitest";
import {
  createExecutionContext,
  createScheduledController,
  abortAllDurableObjects,
  env,
  runInDurableObject,
  runDurableObjectAlarm,
  SELF,
  waitOnExecutionContext,
} from "cloudflare:test";

import { scheduled } from "../../index";
import type { XBookmarkSyncDO } from "../../x-sync";
import { makeAdmin, signupUser } from "./helpers";

const WATERMARK = "bookmark-before-reconciliation";

interface ObservedXState {
  readonly alarm: number | null;
  readonly status: string | undefined;
  readonly syncEnabled: boolean | undefined;
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

  await env.DB.prepare("UPDATE organization SET tier = 'pro' WHERE id = ?")
    .bind(user.orgId)
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
  it("cleans itself up when delayed reconciliation finds no X account", async () => {
    const { stub, user } = await createLinkedPoller({
      alarm: true,
      label: "deleted",
    });
    await env.DB.prepare("DELETE FROM account WHERE user_id = ?")
      .bind(user.userId)
      .run();
    await stub.disconnect();
    await abortAllDurableObjects();

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

  it("rechecks entitlement before an alarm polls X", async () => {
    const { stub, user } = await createLinkedPoller({
      alarm: true,
      label: "alarm",
    });

    await env.DB.prepare("UPDATE organization SET tier = 'free' WHERE id = ?")
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
});
