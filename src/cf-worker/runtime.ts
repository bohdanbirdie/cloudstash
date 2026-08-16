import { Effect } from "effect";
import type { Layer } from "effect";

import type { AuthClient } from "./auth/service";
import { AppLayerLive } from "./auth/service";
import type { WorkspaceAccess } from "./auth/workspace-access";
import type { Billing } from "./billing/service";
import type { DbClient } from "./db/service";
import type { AppSettings } from "./settings/service";
import type { Env } from "./shared";

export type AppCtx =
  | Billing
  | AppSettings
  | AuthClient
  | DbClient
  | WorkspaceAccess;

// One layer object per isolate: services still rebuild per request (each
// top-level Effect.provide creates a fresh MemoMap, v3 and v4 alike), but a
// stable layer identity is what any future cross-request MemoMap keys on.
const appLayerCache = new WeakMap<Env, ReturnType<typeof AppLayerLive>>();
export const getAppLayer = (env: Env): Layer.Layer<AppCtx> => {
  const cached = appLayerCache.get(env);
  if (cached) return cached;
  const layer = AppLayerLive(env);
  appLayerCache.set(env, layer);
  return layer;
};

const onDefect = (defect: unknown) =>
  Effect.logError("Unhandled defect in handler").pipe(
    Effect.annotateLogs({
      error: defect instanceof Error ? defect.message : String(defect),
    }),
    Effect.as(
      Response.json({ error: "Internal server error" }, { status: 500 })
    )
  );

// Runs a Hono request handler: provides the shared app layer and turns any
// unhandled defect into a 500. The effect must have exhausted its error channel.
export const runHandler = (
  env: Env,
  effect: Effect.Effect<Response, never, AppCtx>
): Promise<Response> =>
  effect.pipe(
    Effect.catchDefect(onDefect),
    Effect.provide(getAppLayer(env)),
    Effect.runPromise
  );
