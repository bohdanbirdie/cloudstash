import { Effect } from "effect";

import { capabilityDeniedResponse } from "../billing/errors";
import { requireCapability } from "../billing/service";
import { SessionLookupError } from "../connect/errors";
import { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { AuthClient } from "./service";

/**
 * Returns a 402/4xx Response if `POST /api/auth/api-key/create` should be
 * denied for the caller's workspace (no publicApi capability). Returns
 * `null` to let Better Auth handle the request normally.
 *
 * Server-side callers (`auth.api.createApiKey(...)` from connect handlers)
 * don't hit this HTTP route, so they're unaffected.
 */
export const gateUserApiKeyCreate = Effect.fn("Auth.gateUserApiKeyCreate")(
  function* (request: Request) {
    if (request.method !== "POST") return null;
    const { pathname } = new URL(request.url);
    if (pathname !== "/api/auth/api-key/create") return null;

    const auth = yield* AuthClient;
    const session = yield* Effect.tryPromise({
      try: () => auth.api.getSession({ headers: request.headers }),
      catch: (cause) => new SessionLookupError({ cause }),
    });

    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rawOrgId = session.session?.activeOrganizationId;
    if (!rawOrgId) {
      return Response.json(
        { error: "No active organization" },
        { status: 400 }
      );
    }
    const orgId = OrgId.make(rawOrgId);

    return yield* requireCapability(orgId, "publicApi").pipe(
      Effect.as<Response | null>(null),
      Effect.catchTags({
        CapabilityDisabledError: (e) =>
          Effect.succeed(capabilityDeniedResponse(e)),
        OrgNotFoundError: () =>
          Effect.succeed(
            Response.json({ error: "Organization not found" }, { status: 404 })
          ),
        DbError: (cause) =>
          Effect.logError("Auth.gateUserApiKeyCreate DbError").pipe(
            Effect.annotateLogs({
              orgId: maskId(orgId),
              cause: String(cause),
            }),
            Effect.as(
              Response.json({ error: "Internal error" }, { status: 500 })
            )
          ),
      })
    );
  },
  Effect.catchTag("SessionLookupError", (e) =>
    Effect.logError("Auth.gateUserApiKeyCreate session lookup failed").pipe(
      Effect.annotateLogs({ cause: String(e.cause) }),
      Effect.as<Response | null>(
        Response.json({ error: "Auth backend unavailable" }, { status: 503 })
      )
    )
  )
);
