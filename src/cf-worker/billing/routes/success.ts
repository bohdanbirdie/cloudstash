import { Effect, Option } from "effect";

import { DbError } from "../../db/service";
import { maskId, safeErrorInfo } from "../../log-utils";
import type { Env } from "../../shared";
import { StripeApiError } from "../errors";
import { getStripeCustomerId, syncFromStripe } from "../stripe-sync";
import { runBilling } from "./runtime";
import { appBaseUrl, requireOrg } from "./shared";

const successRequest = Effect.fn("Billing.success")(function* (
  request: Request,
  env: Env
) {
  const { orgId } = yield* requireOrg(request.headers);
  yield* Effect.annotateCurrentSpan({ orgId: maskId(orgId) });
  const customerId = yield* getStripeCustomerId(orgId);

  const backstop = (error: DbError | StripeApiError) =>
    Effect.logWarning(
      "Billing.success sync failed; webhook will backstop"
    ).pipe(
      Effect.annotateLogs({ orgId: maskId(orgId), ...safeErrorInfo(error) })
    );

  yield* Option.match(customerId, {
    onNone: () => Effect.void,
    onSome: (id) =>
      syncFromStripe(id).pipe(
        Effect.catchTags({ DbError: backstop, StripeApiError: backstop })
      ),
  });

  return Response.redirect(`${appBaseUrl(request, env)}/welcome`, 302);
});

export const successProgram = (request: Request, env: Env) =>
  successRequest(request, env).pipe(
    // Browser-only endpoint (Checkout + Portal redirects): land on a page, never JSON.
    Effect.catchAll((error) =>
      Effect.logWarning("Billing.success failed; redirecting to /welcome").pipe(
        Effect.annotateLogs(safeErrorInfo(error)),
        Effect.as(Response.redirect(`${appBaseUrl(request, env)}/welcome`, 302))
      )
    )
  );

export const handleStripeSuccess = (
  request: Request,
  env: Env
): Promise<Response> => runBilling(successProgram(request, env), env);
