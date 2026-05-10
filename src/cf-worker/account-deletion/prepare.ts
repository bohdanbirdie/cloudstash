import { eq } from "drizzle-orm";
import { Effect, Schema } from "effect";

import { OrgId, UserId } from "../db/branded";
import type { WorkflowInstanceId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, DbError, query } from "../db/service";
import { DeletionRuntime } from "./runtime";

export class MissingActiveOrgError extends Schema.TaggedError<MissingActiveOrgError>()(
  "MissingActiveOrgError",
  { userId: UserId }
) {}

const findActiveOrgIdForUser = Effect.fn(
  "AccountDeletion.findActiveOrgIdForUser"
)(function* (userId: UserId) {
  yield* Effect.annotateCurrentSpan({ userId });
  const db = yield* DbClient;
  const membership = yield* query(
    db.query.member.findFirst({
      where: eq(schema.member.userId, userId),
    })
  );
  if (!membership) return yield* new MissingActiveOrgError({ userId });
  return yield* Schema.decodeUnknown(OrgId)(membership.organizationId).pipe(
    Effect.mapError((cause) => new DbError({ cause }))
  );
});

export interface PrepareDeletionInput {
  userId: UserId;
}

export interface PrepareDeletionOutput {
  orgId: OrgId;
  workflowInstanceId: WorkflowInstanceId;
}

/**
 * Phase 1 of account deletion. Synchronous, fail-loud. Runs inside Better Auth's
 * `beforeDelete` hook — throwing aborts the entire deletion.
 *
 *   1. Resolve the user's active org.
 *   2. Trigger (or reuse) the AccountDeletionWorkflow instance for this org.
 *
 * Every actual purge (Telegram, link processor, sync backend, chat, org row)
 * runs as a workflow step — beforeDelete only does what must complete before
 * Better Auth tears down the user record.
 *
 * Idempotency lives entirely in `runtime.ensureWorkflow`: `orgId` is the
 * workflow instance id, so a retry of Better Auth's three-statement deletion
 * sequence picks up the existing (or recently-terminated) workflow instance
 * without spawning a duplicate.
 */
export const prepareDeletion = Effect.fn("AccountDeletion.prepare")(function* (
  input: PrepareDeletionInput
) {
  const orgId = yield* findActiveOrgIdForUser(input.userId);
  const runtime = yield* DeletionRuntime;

  yield* Effect.annotateCurrentSpan({ userId: input.userId, orgId });

  const handle = yield* runtime.ensureWorkflow({
    userId: input.userId,
    orgId,
  });

  return {
    orgId,
    workflowInstanceId: handle.id,
  } satisfies PrepareDeletionOutput;
});
