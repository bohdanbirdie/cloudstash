import { and, eq, ne, notExists } from "drizzle-orm";
import { Data, Effect } from "effect";

import type { UserId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import { SharedPersonalOrgError } from "./prepare";
import type { AccountDeletionParams } from "./runtime";
import { DeletionRuntime } from "./runtime";

export const STEP_RETRY = {
  retries: { limit: 5, delay: "10 seconds", backoff: "exponential" },
  timeout: "1 minute",
} as const;

export const IDENTITY_RETRY = {
  retries: { limit: 10, delay: "1 second", backoff: "exponential" },
  timeout: "1 minute",
} as const;

export class IdentityDeletionPendingError extends Data.TaggedError(
  "IdentityDeletionPendingError"
)<{ readonly userId: UserId }> {
  override get message(): string {
    return "Better Auth identity deletion has not committed yet";
  }
}

export const waitForIdentityDeletion = Effect.fnUntraced(function* (
  payload: AccountDeletionParams
) {
  const db = yield* DbClient;
  const existing = yield* query(
    db.query.user.findFirst({
      columns: { id: true },
      where: eq(schema.user.id, payload.userId),
    })
  );
  if (existing) {
    return yield* new IdentityDeletionPendingError({ userId: payload.userId });
  }
});

export const cancelStripeSubscription = Effect.fn(
  "AccountDeletion.cancelStripeSubscription"
)(function* (payload: AccountDeletionParams) {
  if (payload.stripeSubscriptionId === null) return;
  const runtime = yield* DeletionRuntime;
  yield* runtime.cancelStripeSubscription(
    payload.stripeSubscriptionId,
    payload.orgId
  );
});

export const purgeSyncBackend = Effect.fn("AccountDeletion.purgeSyncBackend")(
  function* (payload: AccountDeletionParams) {
    const runtime = yield* DeletionRuntime;
    yield* runtime.purgeSyncBackend(payload.orgId);
  }
);

export const wipeLinkProcessor = Effect.fn("AccountDeletion.wipeLinkProcessor")(
  function* (payload: AccountDeletionParams) {
    const runtime = yield* DeletionRuntime;
    yield* runtime.retireLinkProcessor(payload.orgId);
  }
);

export const wipeChatAgent = Effect.fn("AccountDeletion.wipeChatAgent")(
  function* (payload: AccountDeletionParams) {
    const runtime = yield* DeletionRuntime;
    yield* runtime.retireChatAgent(payload.orgId);
  }
);

export const purgeXBookmarkSync = Effect.fn(
  "AccountDeletion.purgeXBookmarkSync"
)(function* (payload: AccountDeletionParams) {
  const runtime = yield* DeletionRuntime;
  yield* runtime.purgeXBookmarkSync(payload.userId);
});

export const purgeTelegram = Effect.fn("AccountDeletion.purgeTelegram")(
  function* (payload: AccountDeletionParams) {
    const runtime = yield* DeletionRuntime;
    yield* runtime.purgeTelegram(payload.userId, payload.orgId);
  }
);

export const purgeEnrichmentUsage = Effect.fn(
  "AccountDeletion.purgeEnrichmentUsage"
)(function* (payload: AccountDeletionParams) {
  const runtime = yield* DeletionRuntime;
  yield* runtime.purgeEnrichmentUsage(payload.orgId);
});

export const deleteOrgData = Effect.fn("AccountDeletion.deleteOrgData")(
  function* (payload: AccountDeletionParams) {
    const db = yield* DbClient;
    const anotherMember = db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(
        and(
          eq(schema.member.organizationId, payload.orgId),
          ne(schema.member.userId, payload.userId)
        )
      );

    // The membership predicate and delete execute as one SQLite statement.
    // A concurrent join therefore either blocks this delete or loses to the
    // organization's FK removal; it can never be silently cascaded.
    yield* query(
      db
        .delete(schema.organization)
        .where(
          and(
            eq(schema.organization.id, payload.orgId),
            notExists(anotherMember)
          )
        )
    );
    const survivingOrg = yield* query(
      db.query.organization.findFirst({
        columns: { id: true },
        where: eq(schema.organization.id, payload.orgId),
      })
    );
    if (survivingOrg) {
      return yield* new SharedPersonalOrgError({ userId: payload.userId });
    }
  }
);

interface AccountDeletionStepDefinition {
  readonly name: string;
  readonly config: typeof IDENTITY_RETRY | typeof STEP_RETRY;
  readonly activity: (
    payload: AccountDeletionParams
  ) => Effect.Effect<void, unknown, DbClient | DeletionRuntime>;
}

// This is the production orchestration contract. Keeping it as data makes the
// exact Cloudflare step order and retry policy directly testable.
export const ACCOUNT_DELETION_STEPS: readonly AccountDeletionStepDefinition[] =
  [
    {
      name: "wait-for-identity-deletion",
      config: IDENTITY_RETRY,
      activity: waitForIdentityDeletion,
    },
    {
      name: "cancel-stripe-subscription",
      config: STEP_RETRY,
      activity: cancelStripeSubscription,
    },
    // Stop the server-side LiveStore clients before deleting their source so
    // neither can reconnect and recreate the canonical eventlog after purge.
    {
      name: "wipe-link-processor",
      config: STEP_RETRY,
      activity: wipeLinkProcessor,
    },
    {
      name: "wipe-chat-agent",
      config: STEP_RETRY,
      activity: wipeChatAgent,
    },
    {
      name: "purge-sync-backend",
      config: STEP_RETRY,
      activity: purgeSyncBackend,
    },
    {
      name: "purge-x-bookmark-sync",
      config: STEP_RETRY,
      activity: purgeXBookmarkSync,
    },
    { name: "purge-telegram", config: STEP_RETRY, activity: purgeTelegram },
    {
      name: "purge-enrichment-usage",
      config: STEP_RETRY,
      activity: purgeEnrichmentUsage,
    },
    { name: "delete-org-data", config: STEP_RETRY, activity: deleteOrgData },
  ];
