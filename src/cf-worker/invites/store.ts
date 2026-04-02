import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type { InviteId, UserId } from "../db/branded";
import * as schema from "../db/schema";
import { DbClient, DbError, query } from "../db/service";

type InviteRow = typeof schema.invite.$inferSelect;

type InviteWithRelations = InviteRow & {
  createdBy: { email: string; id: string; name: string } | null;
  usedBy: { email: string; id: string; name: string } | null;
};

export class InviteStore extends Context.Tag("@cloudstash/InviteStore")<
  InviteStore,
  {
    readonly create: (params: {
      id: InviteId;
      code: string;
      createdByUserId: UserId;
      expiresAt: Date | null;
    }) => Effect.Effect<void, DbError>;
    readonly list: () => Effect.Effect<InviteWithRelations[], DbError>;
    readonly findById: (id: InviteId) => Effect.Effect<InviteRow | null, DbError>;
    readonly findValidByCode: (
      code: string
    ) => Effect.Effect<InviteRow | null, DbError>;
    readonly deleteById: (id: InviteId) => Effect.Effect<void, DbError>;
    readonly redeemAndApproveUser: (
      inviteId: InviteId,
      userId: UserId
    ) => Effect.Effect<void, DbError>;
  }
>() {}

export const InviteStoreLive = Layer.effect(
  InviteStore,
  Effect.gen(function* () {
    const db = yield* DbClient;
    return InviteStore.of({
      create: (params) =>
        query(db.insert(schema.invite).values(params)).pipe(Effect.asVoid),

      list: () =>
        query(
          db.query.invite.findMany({
            orderBy: [desc(schema.invite.createdAt)],
            with: {
              createdBy: { columns: { email: true, id: true, name: true } },
              usedBy: { columns: { email: true, id: true, name: true } },
            },
          })
        ) as Effect.Effect<InviteWithRelations[], DbError>,

      findById: (id) =>
        query(
          db.query.invite.findFirst({
            where: eq(schema.invite.id, id),
          })
        ).pipe(Effect.map((r) => r ?? null)),

      findValidByCode: (code) =>
        query(
          db.query.invite.findFirst({
            where: and(
              eq(schema.invite.code, code.toUpperCase()),
              isNull(schema.invite.usedByUserId),
              or(
                isNull(schema.invite.expiresAt),
                gt(schema.invite.expiresAt, new Date())
              )
            ),
          })
        ).pipe(Effect.map((r) => r ?? null)),

      deleteById: (id) =>
        query(db.delete(schema.invite).where(eq(schema.invite.id, id))).pipe(
          Effect.asVoid
        ),

      redeemAndApproveUser: (inviteId, userId) =>
        query(
          db.batch([
            db
              .update(schema.invite)
              .set({ usedAt: new Date(), usedByUserId: userId })
              .where(eq(schema.invite.id, inviteId)),
            db
              .update(schema.user)
              .set({ approved: true })
              .where(eq(schema.user.id, userId)),
          ])
        ).pipe(Effect.asVoid),
    });
  })
);
