import { Effect, Layer } from "effect";

import type { AppCtx } from "../../runtime";
import { getAppLayer } from "../../runtime";
import type { Env } from "../../shared";
import { StripeClient, StripeClientLive } from "../stripe-client";
import { unexpected500 } from "./responses";

// Same-origin fetches and non-browser clients (no header) pass; only an
// explicit cross-site POST is rejected. Don't tighten without breaking those.
export const isCrossSite = (request: Request): boolean =>
  request.headers.get("sec-fetch-site") === "cross-site";

// Memoize per isolate, like `getAppLayer` — avoid rebuilding the layer (and
// re-instantiating Stripe/Db/Auth/Billing) on every request.
const billingLayerCache = new WeakMap<
  Env,
  Layer.Layer<StripeClient | AppCtx>
>();
const getBillingLayer = (env: Env): Layer.Layer<StripeClient | AppCtx> => {
  const cached = billingLayerCache.get(env);
  if (cached) return cached;
  const layer = Layer.mergeAll(StripeClientLive(env), getAppLayer(env));
  billingLayerCache.set(env, layer);
  return layer;
};

export const runBilling = (
  effect: Effect.Effect<Response, never, StripeClient | AppCtx>,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    effect.pipe(
      Effect.provide(getBillingLayer(env)),
      Effect.catchAllCause(unexpected500)
    )
  );
