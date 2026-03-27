import { Context, Effect, Layer, Schema } from "effect";

import type { Database } from ".";
import { createDb } from ".";

export class DbClient extends Context.Tag("@cloudstash/DbClient")<
  DbClient,
  Database
>() {}

export class DbError extends Schema.TaggedError<DbError>()("DbError", {
  cause: Schema.Defect,
}) {}

export const query = <A>(promise: Promise<A>): Effect.Effect<A, DbError> =>
  Effect.tryPromise({
    try: () => promise,
    catch: (cause) => new DbError({ cause }),
  });

export const DbClientLive = (d1: D1Database) =>
  Layer.succeed(DbClient, createDb(d1));
