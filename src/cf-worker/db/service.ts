import { Context, Layer } from "effect";

import type { Database } from ".";
import { createDb } from ".";

export class DbClient extends Context.Tag("@cloudstash/DbClient")<
  DbClient,
  Database
>() {}

export const DbClientLive = (d1: D1Database) =>
  Layer.succeed(DbClient, createDb(d1));
