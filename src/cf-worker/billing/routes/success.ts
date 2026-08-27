import { Effect, Option } from "effect";

import { maskId, safeErrorInfo } from "../../log-utils";
import type { Env } from "../../shared";
import { reconcileDigestSchedule } from "../../weekly-digest/reconcile";
import { getStripeCustomerId, syncFromStripe } from "../stripe-sync";
import { runBilling } from "./runtime";
import { appBaseUrl, requireOrg } from "./shared";

const successRequest = Effect.fn("Billing.success")(function* (
  request: Request,
  welcomeUrl: string
) {
  const { orgId } = yield* requireOrg(request.headers);
  yield* Effect.annotateCurrentSpan({ orgId: maskId(orgId) });
  const customerId = yield* getStripeCustomerId(orgId);

  const backstop = (error: unknown) =>
    Effect.logWarning(
      "Billing.success sync failed; webhook will backstop"
    ).pipe(
      Effect.annotateLogs({ orgId: maskId(orgId), ...safeErrorInfo(error) })
    );

  yield* Option.match(customerId, {
    onNone: () => Effect.void,
    onSome: (id) =>
      syncFromStripe(id).pipe(
        Effect.flatMap((syncedOrgId) =>
          syncedOrgId ? reconcileDigestSchedule(syncedOrgId) : Effect.void
        ),
        Effect.catchTags({
          DbError: backstop,
          DigestScheduleReconcileError: (error) => backstop(error.cause),
          StripeApiError: backstop,
        })
      ),
  });

  return Response.redirect(welcomeUrl, 302);
});

export const successProgram = (request: Request, welcomeUrl: string) =>
  successRequest(request, welcomeUrl).pipe(
    // Browser-only endpoint (Checkout + Portal redirects): land on a page, never JSON.
    Effect.catch((error) =>
      Effect.logWarning("Billing.success failed; redirecting to /welcome").pipe(
        Effect.annotateLogs(safeErrorInfo(error)),
        Effect.as(Response.redirect(welcomeUrl, 302))
      )
    )
  );

export const handleStripeSuccess = (
  request: Request,
  env: Env
): Promise<Response> => {
  const welcomeUrl = `${appBaseUrl(request, env)}/welcome`;
  return runBilling(successProgram(request, welcomeUrl), env);
};
