import { Effect } from "effect";

import { safeErrorInfo } from "../../log-utils";
import type { StripeApiError } from "../errors";

export const json = (status: number, error: string): Response =>
  Response.json({ error }, { status });

export const forbidden = () => json(403, "Forbidden");

const loggedResponse =
  (label: string, status: number, error: string) =>
  (cause: unknown): Effect.Effect<Response> =>
    Effect.logError(label).pipe(
      Effect.annotateLogs(safeErrorInfo(cause)),
      Effect.as(json(status, error))
    );

export const unexpected500 = loggedResponse(
  "Billing handler crashed",
  500,
  "Internal error"
);

export const stripeErrorResponse = (
  error: StripeApiError
): Effect.Effect<Response> =>
  Effect.logError("Billing: Stripe API error").pipe(
    Effect.annotateLogs({
      code: error.code,
      requestId: error.requestId,
      ...safeErrorInfo(error),
    }),
    Effect.as(json(502, "Payment provider error"))
  );

export const dbErrorResponse = loggedResponse(
  "Billing: DbError",
  500,
  "Internal error"
);
export const configErrorResponse = loggedResponse(
  "Billing: misconfiguration",
  500,
  "Internal error"
);

export const invalidBodyResponse = (): Effect.Effect<Response> =>
  Effect.succeed(json(400, "Invalid request body"));

export const sessionErrorTags = {
  ConnectUnauthorizedError: () => Effect.succeed(json(401, "Unauthorized")),
  SessionLookupError: () =>
    Effect.succeed(json(503, "Auth backend unavailable")),
  NoActiveOrgError: () => Effect.succeed(json(400, "No active organization")),
  OrgNotFoundError: () => Effect.succeed(json(404, "Organization not found")),
} as const;
