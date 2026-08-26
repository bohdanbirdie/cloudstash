import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer, Option } from "effect";

import { AuthClient } from "../auth/service";
import { Billing } from "../billing/service";
import { OrgId, UserId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import { maskId } from "../log-utils";
import { sideEffectError } from "./effects-helpers";

type BetterAuthAccountRowId = (typeof schema.account.$inferSelect)["id"];

const makeXSyncAccountRepository = Effect.gen(function* () {
  const auth = yield* AuthClient;
  const billing = yield* Billing;
  const db = yield* DbClient;

  return {
    capabilities: Effect.fn("XSyncAccountRepository.capabilities")(function* (
      organizationId: OrgId
    ) {
      return yield* billing.capabilities(organizationId).pipe(
        Effect.map(Option.some),
        Effect.catchTag("OrgNotFoundError", () => Effect.succeed(Option.none()))
      );
    }),
    findAccount: Effect.fn("XSyncAccountRepository.findAccount")(function* (
      userId: UserId
    ) {
      yield* Effect.annotateCurrentSpan("userId", maskId(userId));
      const account = yield* query(
        db.query.account.findFirst({
          columns: { id: true },
          where: and(
            eq(schema.account.userId, userId),
            eq(schema.account.providerId, "x")
          ),
        })
      );
      if (!account) return null;
      return { id: account.id };
    }),
    getAccessToken: Effect.fn("XSyncAccountRepository.getAccessToken")(
      function* (userId: UserId, accountId: BetterAuthAccountRowId) {
        const result = yield* Effect.tryPromise({
          try: () => auth.api.getAccessToken({ body: { accountId, userId } }),
          catch: sideEffectError("auth.getAccessToken"),
        });
        return result.accessToken;
      }
    ),
    getOrganizationId: Effect.fn("XSyncAccountRepository.getOrganizationId")(
      function* (userId: UserId) {
        yield* Effect.annotateCurrentSpan("userId", maskId(userId));
        const member = yield* query(
          db.query.member.findFirst({
            where: eq(schema.member.userId, userId),
          })
        );
        if (!member) return null;
        return OrgId.make(member.organizationId);
      }
    ),
  };
});

export class XSyncAccountRepository extends Context.Service<
  XSyncAccountRepository,
  Effect.Success<typeof makeXSyncAccountRepository>
>()("@cloudstash/x-sync/XSyncAccountRepository") {
  static readonly layer = Layer.effect(
    XSyncAccountRepository,
    makeXSyncAccountRepository
  );
}
