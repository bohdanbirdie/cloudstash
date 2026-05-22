import { eq } from "drizzle-orm";
import { Effect, Schema } from "effect";

import { personalOrgSlug } from "../account-deletion/prepare";
import { UserId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, DbError, query } from "../db/service";
import { maskId, safeErrorInfo } from "../log-utils";
import { AppSettings } from "../settings/service";
import type { XBookmarkSyncDO } from "../x-sync";

export class CreateOrganizationError extends Schema.TaggedError<CreateOrganizationError>()(
  "CreateOrganizationError",
  { cause: Schema.Defect }
) {}

export class XBookmarkSyncStartError extends Schema.TaggedError<XBookmarkSyncStartError>()(
  "XBookmarkSyncStartError",
  { cause: Schema.Defect }
) {}

export const autoApproveUser = Effect.fn("Auth.autoApproveUser")(function* (
  userId: UserId
) {
  const settings = yield* AppSettings;
  if (yield* settings.signupGateEnabled()) return;

  const db = yield* DbClient;
  yield* query(
    db
      .update(schema.user)
      .set({ approved: true })
      .where(eq(schema.user.id, userId))
  );
  yield* Effect.logInfo("signup auto-approved (gate open)").pipe(
    Effect.annotateLogs({ userId: maskId(userId) })
  );
});

export const startXBookmarkSyncForAccount = Effect.fn(
  "Auth.startXBookmarkSync"
)(function* (
  account: { readonly providerId: string; readonly userId: string },
  namespace: DurableObjectNamespace<XBookmarkSyncDO>
) {
  if (account.providerId !== "x") return;

  const stub = namespace.get(namespace.idFromName(account.userId));
  yield* Effect.tryPromise({
    try: () => stub.start(),
    catch: (cause) => new XBookmarkSyncStartError({ cause }),
  });
  yield* Effect.logInfo("x-link: DO started").pipe(
    Effect.annotateLogs({ userId: maskId(account.userId) })
  );
});

export interface ResolveActiveOrgDeps {
  readonly createOrganization: (input: {
    name: string;
    slug: string;
    userId: string;
  }) => Promise<{ id: string } | null | undefined>;
}

const logEnsureFailure = (error: DbError | CreateOrganizationError) =>
  Effect.logError("Failed to ensure membership").pipe(
    Effect.annotateLogs(safeErrorInfo(error))
  );

const repairOrCreateMembership = Effect.fn("Auth.repairOrCreateMembership")(
  function* (userId: UserId, deps: ResolveActiveOrgDeps) {
    const db = yield* DbClient;
    const slug = personalOrgSlug(userId);

    const existingOrg = yield* query(
      db.query.organization.findFirst({
        where: eq(schema.organization.slug, slug),
      })
    );

    if (existingOrg) {
      // Org exists but the owner's member row is gone (e.g. an ON DELETE
      // CASCADE during an organization-table rebuild). Repair it directly —
      // createOrganization would 409 "Organization already exists".
      yield* query(
        db.insert(schema.member).values({
          id: crypto.randomUUID(),
          organizationId: existingOrg.id,
          userId,
          role: "owner",
        })
      );
      yield* Effect.logInfo("Repaired missing membership").pipe(
        Effect.annotateLogs({ orgId: maskId(existingOrg.id) })
      );
      return;
    }

    const user = yield* query(
      db.query.user.findFirst({ where: eq(schema.user.id, userId) })
    );
    const orgName = user?.name ? `${user.name}'s Workspace` : "My Workspace";
    const org = yield* Effect.tryPromise({
      try: () => deps.createOrganization({ name: orgName, slug, userId }),
      catch: (cause) => new CreateOrganizationError({ cause }),
    });
    yield* Effect.logInfo("Created organization").pipe(
      Effect.annotateLogs({ orgId: maskId(org?.id ?? "") })
    );
  }
);

export const resolveActiveOrg = Effect.fn("Auth.resolveActiveOrg")(function* (
  session: { readonly userId: string },
  deps: ResolveActiveOrgDeps
) {
  const db = yield* DbClient;
  const userId = UserId.make(session.userId);
  const findMembership = () =>
    query(
      db.query.member.findFirst({ where: eq(schema.member.userId, userId) })
    );

  const existing = yield* findMembership();
  if (existing) return existing.organizationId;

  yield* repairOrCreateMembership(userId, deps).pipe(
    Effect.catchTags({
      // Concurrent first-session race — the winner's row is already present;
      // the re-fetch below recovers it.
      DbError: logEnsureFailure,
      CreateOrganizationError: logEnsureFailure,
    })
  );

  const repaired = yield* findMembership();
  return repaired?.organizationId ?? null;
});
