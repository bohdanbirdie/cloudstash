import { and, eq } from "drizzle-orm";
import { Effect, Schema } from "effect";

import { OrgId, UserId } from "../db/branded";
import type { WorkflowInstanceId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, DbError, query } from "../db/service";
import { maskId } from "../log-utils";
import { DeletionRuntime } from "./runtime";

export class MissingActiveOrgError extends Schema.TaggedError<MissingActiveOrgError>()(
  "MissingActiveOrgError",
  { userId: UserId }
) {}

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

  const membership = yield* query(
    db.query.member.findFirst({
      where: and(
        eq(schema.member.organizationId, org.id),
        eq(schema.member.userId, userId)
      ),
    })
  );
  if (!membership || membership.role !== "owner") {
    return yield* new MissingActiveOrgError({ userId });
  }

  return yield* Schema.decodeUnknown(OrgId)(org.id).pipe(
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

// Resolves the deleter's personal org and starts (or rejoins) the
// AccountDeletionWorkflow for it. Returns null when there's no personal org
// to purge so Better Auth's `beforeDelete` still allows the user row to be
// removed. Idempotency lives in `runtime.ensureWorkflow`.
export const prepareDeletion = Effect.fn("AccountDeletion.prepare")(function* (
  input: PrepareDeletionInput
) {
  const orgId = yield* findPersonalOrgIdForUser(input.userId).pipe(
    Effect.catchTag("MissingActiveOrgError", () => Effect.succeed(null))
  );
  if (orgId === null) {
    yield* Effect.logWarning(
      "No personal org for user — skipping purge workflow"
    ).pipe(Effect.annotateLogs({ userId: maskId(input.userId) }));
    return null;
  }

  const runtime = yield* DeletionRuntime;

  yield* Effect.annotateCurrentSpan({
    orgId: maskId(orgId),
    userId: maskId(input.userId),
  });

  const handle = yield* runtime.ensureWorkflow({
    userId: input.userId,
    orgId,
  });

  return {
    orgId,
    workflowInstanceId: handle.id,
  } satisfies PrepareDeletionOutput;
});
