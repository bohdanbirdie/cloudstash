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
  | "purgeSyncBackend"
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
      purgeSyncBackend: () => call("purgeSyncBackend"),
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

  it("stops sync clients before purging their canonical source", () => {
    expect(ACCOUNT_DELETION_STEPS.map(({ name }) => name)).toEqual([
      "wait-for-identity-deletion",
      "cancel-stripe-subscription",
      "wipe-chat-agent",
      "wipe-link-processor",
      "purge-sync-backend",
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
    const activity = ACCOUNT_DELETION_STEPS.find(
      (step) => step.name === "purge-sync-backend"
    )?.activity;

    expect(activity).toBeDefined();
    const callback = () =>
      Effect.runPromise(
        activity!(payload).pipe(
          Effect.provide(
            Layer.merge(runtimeLayer(calls, "purgeSyncBackend"), dbLayer())
          )
        )
      );

    await expect(callback()).rejects.toBeInstanceOf(DeletionRuntimeError);
    expect(calls).toEqual(["purgeSyncBackend"]);
  });
});
