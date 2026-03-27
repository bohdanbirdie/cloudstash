import { Context, Effect, Layer } from "effect";

import type { Auth } from ".";
import { createAuth } from ".";
import { DbClient, DbClientLive } from "../db/service";
import type { Env } from "../shared";

export class AuthClient extends Context.Tag("@cloudstash/AuthClient")<
  AuthClient,
  Auth
>() {}

export const AuthClientLive = (env: Env) =>
  Layer.effect(
    AuthClient,
    Effect.gen(function* () {
      const db = yield* DbClient;
      return createAuth(env, db);
    })
  );

export const AppLayerLive = (env: Env) =>
  AuthClientLive(env).pipe(Layer.provideMerge(DbClientLive(env.DB)));
