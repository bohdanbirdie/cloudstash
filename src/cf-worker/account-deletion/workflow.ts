import { and, eq, ne, notExists } from "drizzle-orm";
import { Data, Effect } from "effect";

import type { UserId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, DbError, query } from "../db/service";
import { SharedPersonalOrgError } from "./prepare";
import type { AccountDeletionParams, DeletionRuntimeShape } from "./runtime";
import { DeletionRuntime, DeletionRuntimeError } from "./runtime";

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

type AccountDeletionStepError =
  | DbError
  | DeletionRuntimeError
  | IdentityDeletionPendingError
  | SharedPersonalOrgError;

interface AccountDeletionStepDefinition {
  readonly name: string;
  readonly config: typeof IDENTITY_RETRY | typeof STEP_RETRY;
  readonly activity: (
    payload: AccountDeletionParams
  ) => Effect.Effect<
    void,
    AccountDeletionStepError,
    DbClient | DeletionRuntime
  >;
}

const runtimeActivity =
  (
    activity: (
      runtime: DeletionRuntimeShape,
      payload: AccountDeletionParams
    ) => Effect.Effect<void, DeletionRuntimeError>
  ): AccountDeletionStepDefinition["activity"] =>
  (payload) =>
    Effect.flatMap(DeletionRuntime, (runtime) => activity(runtime, payload));

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
      activity: runtimeActivity((runtime, payload) =>
        payload.stripeSubscriptionId === null
          ? Effect.void
          : runtime.cancelStripeSubscription(
              payload.stripeSubscriptionId,
              payload.orgId
            )
      ),
    },
    // The processor owns the chat registry, so retire its conversations before
    // wiping that registry and the server-side LiveStore client.
    {
      name: "wipe-chat-agent",
      config: STEP_RETRY,
      activity: runtimeActivity((runtime, payload) =>
        runtime.retireChatAgent(payload.orgId)
      ),
    },
    {
      name: "wipe-link-processor",
      config: STEP_RETRY,
      activity: runtimeActivity((runtime, payload) =>
        runtime.retireLinkProcessor(payload.orgId)
      ),
    },
    {
      name: "purge-sync-backend",
      config: STEP_RETRY,
      activity: runtimeActivity((runtime, payload) =>
        runtime.purgeSyncBackend(payload.orgId)
      ),
    },
    {
      name: "purge-x-bookmark-sync",
      config: STEP_RETRY,
      activity: runtimeActivity((runtime, payload) =>
        runtime.purgeXBookmarkSync(payload.userId)
      ),
    },
    {
      name: "purge-telegram",
      config: STEP_RETRY,
      activity: runtimeActivity((runtime, payload) =>
        runtime.purgeTelegram(payload.userId, payload.orgId)
      ),
    },
    {
      name: "purge-enrichment-usage",
      config: STEP_RETRY,
      activity: runtimeActivity((runtime, payload) =>
        runtime.purgeEnrichmentUsage(payload.orgId)
      ),
    },
    { name: "delete-org-data", config: STEP_RETRY, activity: deleteOrgData },
  ];
