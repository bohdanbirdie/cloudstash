import { eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import type { Auth } from ".";
import { createAuth } from ".";
import * as schema from "../db/schema";
import { DbClient, DbClientLive, DbError, query } from "../db/service";
import type { Env } from "../shared";

type UserRow = typeof schema.user.$inferSelect;

export class AuthClient extends Context.Tag("@cloudstash/AuthClient")<
  AuthClient,
  Auth & {
    readonly findUser: (
      userId: string
    ) => Effect.Effect<UserRow | null, DbError>;
    readonly approveUser: (userId: string) => Effect.Effect<void, DbError>;
    readonly listApprovedUsers: () => Effect.Effect<UserRow[], DbError>;
  }
>() {}

export const AuthClientLive = (env: Env) =>
  Layer.effect(
    AuthClient,
    Effect.gen(function* () {
      const db = yield* DbClient;
      const auth = createAuth(env, db);

      return {
        ...auth,
        findUser: (userId: string) =>
          query(
            db.query.user.findFirst({
              where: eq(schema.user.id, userId),
            })
          ).pipe(Effect.map((r) => r ?? null)),

        approveUser: (userId: string) =>
          query(
            db
              .update(schema.user)
              .set({ approved: true })
              .where(eq(schema.user.id, userId))
          ).pipe(Effect.asVoid),

        listApprovedUsers: () =>
          query(
            db.query.user.findMany({
              where: eq(schema.user.approved, true),
            })
          ),
      };
    })
  );

export const AppLayerLive = (env: Env) =>
  AuthClientLive(env).pipe(Layer.provideMerge(DbClientLive(env.DB)));
