import { and, eq } from "drizzle-orm";
import { Effect } from "effect";

import { OrgId, UserId } from "../db/branded";
import type { OrgId as OrgIdType } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, query } from "../db/service";
import type { XReconcileMessage } from "./reconcile-queue";
import { XReconcileQueue } from "./reconcile-queue";

const send = Effect.fn("XReconcileTriggers.send")(function* (
  messages: ReadonlyArray<XReconcileMessage>
) {
  const queue = yield* XReconcileQueue;
  yield* Effect.forEach(messages, queue.send, {
    concurrency: 5,
    discard: true,
  });
  return messages.length;
});

export const enqueueOrgXReconcile = Effect.fn("XReconcileTriggers.enqueueOrg")(
  function* (orgId: OrgIdType) {
    const db = yield* DbClient;
    const rows = yield* query(
      db
        .selectDistinct({ userId: schema.account.userId })
        .from(schema.account)
        .innerJoin(
          schema.member,
          eq(schema.member.userId, schema.account.userId)
        )
        .where(
          and(
            eq(schema.account.providerId, "x"),
            eq(schema.member.organizationId, orgId)
          )
        )
    );

    return yield* send(
      rows.map(({ userId }) => ({
        userId: UserId.make(userId),
        orgId,
        wakeForEntitlementChange: true,
      }))
    );
  }
);

export const enqueueAllXReconciles = Effect.fn("XReconcileTriggers.enqueueAll")(
  function* () {
    const db = yield* DbClient;
    const rows = yield* query(
      db
        .selectDistinct({
          userId: schema.account.userId,
          orgId: schema.member.organizationId,
        })
        .from(schema.account)
        .innerJoin(
          schema.member,
          eq(schema.member.userId, schema.account.userId)
        )
        .where(eq(schema.account.providerId, "x"))
    );
    const messages = rows
      .toSorted((left, right) => {
        const userOrder = left.userId.localeCompare(right.userId);
        if (userOrder !== 0) return userOrder;
        return left.orgId.localeCompare(right.orgId);
      })
      .filter(
        (row, index, sorted) =>
          index === 0 || sorted[index - 1]?.userId !== row.userId
      )
      .map(({ userId, orgId }) => ({
        userId: UserId.make(userId),
        orgId: OrgId.make(orgId),
        wakeForEntitlementChange: false,
      }));

    return yield* send(messages);
  }
);
