import { Effect, Layer } from "effect";

import type { AppCtx } from "../../runtime";
import { getAppLayer } from "../../runtime";
import type { Env } from "../../shared";
import { XReconcileQueue } from "../../x-sync/reconcile-queue";
import { StripeClient, StripeClientLive } from "../stripe-client";
import { unexpected500 } from "./responses";

// Same-origin fetches and non-browser clients (no header) pass; only an
// explicit cross-site POST is rejected. Don't tighten without breaking those.
export const isCrossSite = (request: Request): boolean =>
  request.headers.get("sec-fetch-site") === "cross-site";

// One layer object per isolate, like `getAppLayer` — see the note there.
const billingLayerCache = new WeakMap<
  Env,
  ReturnType<typeof getBillingLayerValue>
>();

const getBillingLayerValue = (env: Env) =>
  Layer.mergeAll(
    StripeClientLive(env),
    XReconcileQueue.layer(env.X_RECONCILE_QUEUE)
  ).pipe(Layer.provideMerge(getAppLayer(env)));

const getBillingLayer = (env: Env) => {
  const cached = billingLayerCache.get(env);
  if (cached) return cached;
  const layer = getBillingLayerValue(env);
  billingLayerCache.set(env, layer);
  return layer;
};

export const runBilling = (
  effect: Effect.Effect<
    Response,
    never,
    StripeClient | XReconcileQueue | AppCtx
  >,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(getBillingLayer(env)),
      Effect.catchCause(unexpected500)
    )
  );
