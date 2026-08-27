import { it } from "@effect/vitest";
import { Effect, Layer, Result } from "effect";
import { describe, expect } from "vitest";

import { OrgId, StripeSubscriptionId, UserId } from "../../db/branded";
import { DbClient } from "../../db/service";
import { DeletionRuntime, DeletionRuntimeError } from "../runtime";
import type { AccountDeletionParams } from "../runtime";
import {
  ACCOUNT_DELETION_STEPS,
  IdentityDeletionPendingError,
  IDENTITY_RETRY,
  STEP_RETRY,
  waitForIdentityDeletion,
  wipeSyncBackend,
} from "../workflow";

const payload: AccountDeletionParams = {
  userId: UserId.make("user-1"),
  orgId: OrgId.make("org-1"),
  stripeSubscriptionId: StripeSubscriptionId.make("sub-1"),
};

const dbLayer = (identityExists = false) =>
  Layer.succeed(DbClient, {
    query: {
      user: {
        findFirst: async () => (identityExists ? { id: "user-1" } : undefined),
      },
    },
    delete: () => ({ where: async () => undefined }),
  } as never);

type RuntimeMethod =
  | "cancelStripeSubscription"
  | "retireLinkProcessor"
  | "retireSyncBackend"
  | "retireChatAgent"
  | "purgeTelegram"
  | "purgeXBookmarkSync"
  | "purgeEnrichmentUsage";

const runtimeLayer = (calls: RuntimeMethod[], failOn?: RuntimeMethod) => {
  const call = (name: RuntimeMethod) =>
    Effect.suspend(() => {
      calls.push(name);
      return name === failOn
        ? Effect.fail(
            new DeletionRuntimeError({
              op: name,
              cause: new Error(`${name} failed`),
            })
          )
        : Effect.void;
    });
  return Layer.succeed(
    DeletionRuntime,
    DeletionRuntime.of({
      retireLinkProcessor: () => call("retireLinkProcessor"),
      retireSyncBackend: () => call("retireSyncBackend"),
      retireChatAgent: () => call("retireChatAgent"),
      purgeTelegram: () => call("purgeTelegram"),
      purgeXBookmarkSync: () => call("purgeXBookmarkSync"),
      purgeEnrichmentUsage: () => call("purgeEnrichmentUsage"),
      cancelStripeSubscription: () => call("cancelStripeSubscription"),
      ensureWorkflow: () => Effect.die("not used"),
    })
  );
};

describe("account deletion activities", () => {
  it.effect("waits until Better Auth has removed the user row", () =>
    waitForIdentityDeletion(payload).pipe(
      Effect.provide(dbLayer(true)),
      Effect.result,
      Effect.tap((result) =>
        Effect.sync(() => {
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result)) {
            expect(result.failure).toBeInstanceOf(IdentityDeletionPendingError);
          }
        })
      )
    )
  );

  it("uses the source-first production step order and retry policies", () => {
    expect(ACCOUNT_DELETION_STEPS.map(({ name }) => name)).toEqual([
      "wait-for-identity-deletion",
      "cancel-stripe-subscription",
      "wipe-sync-backend",
      "wipe-link-processor",
      "wipe-chat-agent",
      "purge-x-bookmark-sync",
      "purge-telegram",
      "purge-enrichment-usage",
      "delete-org-data",
    ]);
    expect(ACCOUNT_DELETION_STEPS[0]?.config).toBe(IDENTITY_RETRY);
    expect(
      ACCOUNT_DELETION_STEPS.slice(1).every(
        ({ config }) => config === STEP_RETRY
      )
    ).toBe(true);
  });

  it("keeps a failing Effect activity as a rejected step callback Promise", async () => {
    const calls: RuntimeMethod[] = [];
    const callback = () =>
      Effect.runPromise(
        wipeSyncBackend(payload).pipe(
          Effect.provide(runtimeLayer(calls, "retireSyncBackend"))
        )
      );

    await expect(callback()).rejects.toBeInstanceOf(DeletionRuntimeError);
    expect(calls).toEqual(["retireSyncBackend"]);
  });
});
