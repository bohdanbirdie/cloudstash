import { eq } from "drizzle-orm";
import { Data, Effect, Layer, Schema } from "effect";

import { OrgId, StripeSubscriptionId, UserId } from "../db/branded";
import type { WorkflowInstanceId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, DbClientLive, DbError, query } from "../db/service";
import { maskId } from "../log-utils";
import type { Env } from "../shared";
import { OtelTracingLive } from "../tracing";
import { DeletionRuntime, DeletionRuntimeLive } from "./runtime";

export const DeletionPreparationLive = (env: Env) =>
  Layer.mergeAll(
    DbClientLive(env.DB),
    DeletionRuntimeLive(env),
    OtelTracingLive
  );

export class MissingActiveOrgError extends Data.TaggedError(
  "MissingActiveOrgError"
)<{ readonly userId: UserId }> {}

export class SharedPersonalOrgError extends Data.TaggedError(
  "SharedPersonalOrgError"
)<{ readonly userId: UserId }> {}

// Slug also produced by the bootstrap hook in `auth/index.ts` — share it
// to keep creation and lookup in sync.
export const personalOrgSlug = (userId: UserId): string => `user-${userId}`;

const findPersonalOrgIdForUser = Effect.fn(
  "AccountDeletion.findPersonalOrgIdForUser"
)(function* (userId: UserId) {
  yield* Effect.annotateCurrentSpan({ userId: maskId(userId) });
  const db = yield* DbClient;
  const slug = personalOrgSlug(userId);

  const org = yield* query(
    db.query.organization.findFirst({
      where: eq(schema.organization.slug, slug),
    })
  );
  if (!org) return yield* new MissingActiveOrgError({ userId });

  const memberships = yield* query(
    db.query.member.findMany({
      columns: { role: true, userId: true },
      where: eq(schema.member.organizationId, org.id),
    })
  );
  const membership = memberships.find(
    (candidate) => candidate.userId === userId
  );
  if (!membership || membership.role !== "owner") {
    return yield* new MissingActiveOrgError({ userId });
  }
  if (memberships.some((candidate) => candidate.userId !== userId)) {
    return yield* new SharedPersonalOrgError({ userId });
  }

  const orgId = yield* Schema.decodeUnknownEffect(OrgId)(org.id).pipe(
    Effect.mapError((cause) => new DbError({ cause }))
  );
  const stripeSubscriptionId = org.stripeSubscriptionId
    ? yield* Schema.decodeUnknownEffect(StripeSubscriptionId)(
        org.stripeSubscriptionId
      ).pipe(Effect.mapError((cause) => new DbError({ cause })))
    : null;
  return { orgId, stripeSubscriptionId };
});

export interface PrepareDeletionInput {
  userId: UserId;
}

export interface PrepareDeletionOutput {
  orgId: OrgId;
  workflowInstanceId: WorkflowInstanceId;
}

// Resolves the deleter's personal org and starts (or rejoins) the
// AccountDeletionWorkflow for it. Missing, shared, or inconsistent tenancy
// fails loudly, preventing Better Auth from removing the identity or deleting
// another user's workspace membership while collaboration remains undefined.
// The deterministic Workflow instance is the durable idempotency record.
export const prepareDeletion = Effect.fn("AccountDeletion.prepare")(function* (
  input: PrepareDeletionInput
) {
  const { orgId, stripeSubscriptionId } = yield* findPersonalOrgIdForUser(
    input.userId
  );
  const runtime = yield* DeletionRuntime;

  yield* Effect.annotateCurrentSpan({
    orgId: maskId(orgId),
    userId: maskId(input.userId),
  });

  const handle = yield* runtime.ensureWorkflow({
    userId: input.userId,
    orgId,
    stripeSubscriptionId,
  });

  return {
    orgId,
    workflowInstanceId: handle.id,
  } satisfies PrepareDeletionOutput;
});
