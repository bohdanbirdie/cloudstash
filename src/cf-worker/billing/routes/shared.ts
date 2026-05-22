import { Effect, Schema } from "effect";

import { AuthClient } from "../../auth/service";
import {
  ConnectUnauthorizedError,
  NoActiveOrgError,
  SessionLookupError,
} from "../../connect/errors";
import { OrgId, UserId } from "../../db/branded";
import type { Env } from "../../shared";

export class InvalidBodyError extends Schema.TaggedError<InvalidBodyError>()(
  "InvalidBodyError",
  { cause: Schema.Defect }
) {}

export const CheckoutBody = Schema.Struct({
  tier: Schema.Literal("plus", "pro"),
});

export const PortalBody = Schema.Struct({
  tier: Schema.Literal("free", "plus", "pro"),
});

export const decodeBody = <A, I>(
  request: Request,
  schema: Schema.Schema<A, I>
) =>
  Effect.tryPromise({
    try: () => request.json(),
    catch: (cause) => new InvalidBodyError({ cause }),
  }).pipe(
    Effect.flatMap((raw) =>
      Schema.decodeUnknown(schema)(raw).pipe(
        Effect.mapError((cause) => new InvalidBodyError({ cause }))
      )
    )
  );

export const appBaseUrl = (request: Request, env: Env): string => {
  const fromEnv = env.PUBLIC_URL?.trim().replace(/\/+$/, "");
  return fromEnv && fromEnv.length > 0 ? fromEnv : new URL(request.url).origin;
};

export const requireOrg = Effect.fn("Billing.requireOrg")(function* (
  headers: Headers
) {
  const auth = yield* AuthClient;
  const session = yield* Effect.tryPromise({
    try: () => auth.api.getSession({ headers }),
    catch: (cause) => new SessionLookupError({ cause }),
  });
  if (!session?.session) {
    return yield* new ConnectUnauthorizedError();
  }
  const userId = UserId.make(session.user.id);
  if (!session.session.activeOrganizationId) {
    return yield* new NoActiveOrgError({ userId });
  }
  return { userId, orgId: OrgId.make(session.session.activeOrganizationId) };
});
