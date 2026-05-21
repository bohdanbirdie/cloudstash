import { isAPIError } from "better-auth/api";
import { Effect } from "effect";

import { trackEvent } from "../analytics";
import type { Auth } from "../auth";
import { AuthClient } from "../auth/service";
import { Billing } from "../billing/service";
import { OrgId, UserId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import { runHandler } from "../runtime";
import type { Env } from "../shared";
import {
  AccessDeniedError,
  OrgNotFoundError,
  OrgUnauthorizedError,
  OrgUpstreamError,
} from "./errors";

const getSession = Effect.fn("Org.getSession")(function* (
  auth: Auth,
  headers: Headers
) {
  const session = yield* Effect.tryPromise({
    catch: () => OrgUnauthorizedError.make({}),
    try: () => auth.api.getSession({ headers }),
  });
  if (!session) {
    return yield* OrgUnauthorizedError.make({});
  }
  return session;
});

const getOrgWithCapabilities = Effect.fn("Org.getOrgWithCapabilities")(
  function* (auth: Auth, headers: Headers, orgId: OrgId, userId: UserId) {
    yield* Effect.annotateCurrentSpan({ orgId: maskId(orgId) });

    const apiOrg = yield* Effect.tryPromise({
      catch: (error) => classifyFullOrgError(error, orgId, userId),
      try: () =>
        auth.api.getFullOrganization({
          headers,
          query: { organizationId: orgId },
        }),
    });

    if (!apiOrg) {
      return yield* OrgNotFoundError.make({ orgId });
    }

    const billing = yield* Billing;
    const tier = yield* billing.tier(orgId);
    const capabilities = yield* billing.capabilities(orgId);

    yield* Effect.annotateCurrentSpan({ tier });

    return {
      id: apiOrg.id,
      name: apiOrg.name,
      slug: apiOrg.slug,
      tier,
      capabilities,
    };
  }
);

const handleGetMeRequest = Effect.fn("Org.handleGetMeRequest")(function* (
  request: Request
) {
  const auth = yield* AuthClient;
  const session = yield* getSession(auth, request.headers);
  const rawOrgId = session.session.activeOrganizationId;

  const organization = rawOrgId
    ? yield* getOrgWithCapabilities(
        auth,
        request.headers,
        OrgId.make(rawOrgId),
        UserId.make(session.user.id)
      )
    : null;

  return {
    organization,
    session: { activeOrganizationId: rawOrgId ?? null },
    user: {
      email: session.user.email,
      id: session.user.id,
      name: session.user.name,
    },
  };
});

export const handleGetMe = (request: Request, env: Env): Promise<Response> =>
  runHandler(
    env,
    handleGetMeRequest(request).pipe(
      Effect.tap((data) =>
        Effect.logDebug("Get me success").pipe(
          Effect.annotateLogs({
            hasOrg: !!data.organization,
            orgId: data.organization ? maskId(data.organization.id) : null,
          }),
          Effect.tap(() =>
            Effect.sync(() =>
              trackEvent(env.USAGE_ANALYTICS, {
                userId: data.user.id,
                event: "auth",
                orgId: data.organization?.id ?? "",
              })
            )
          )
        )
      ),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        DbError: (cause) =>
          Effect.logError("Get me DbError").pipe(
            Effect.annotateLogs({ cause: String(cause) }),
            Effect.as(
              Response.json({ error: "Internal server error" }, { status: 500 })
            )
          ),
        AccessDeniedError: (e) =>
          Effect.logInfo("Get me access denied").pipe(
            Effect.annotateLogs({
              orgId: maskId(e.orgId),
              userId: maskId(e.userId),
            }),
            Effect.as(
              Response.json({ error: "Access denied" }, { status: 403 })
            )
          ),
        OrgNotFoundError: () =>
          Effect.logInfo("Get me org not found").pipe(
            Effect.as(
              Response.json(
                { error: "Organization not found" },
                { status: 404 }
              )
            )
          ),
        OrgUpstreamError: (e) =>
          Effect.logError("Get me upstream error").pipe(
            Effect.annotateLogs({
              orgId: maskId(e.orgId),
              ...safeErrorInfo(e.cause),
            }),
            Effect.as(
              Response.json({ error: "Internal server error" }, { status: 500 })
            )
          ),
        OrgUnauthorizedError: () =>
          Effect.logDebug("Get me unauthorized").pipe(
            Effect.as(Response.json({ error: "Unauthorized" }, { status: 401 }))
          ),
      })
    )
  );

// Map a thrown Better Auth error to a tagged error. 403 → not a member;
// its 400/404 → organization missing; anything else (network, timeout, 5xx,
// unexpected shape) is an upstream failure that must surface as 500, not 404.
export const classifyFullOrgError = (
  error: unknown,
  orgId: OrgId,
  userId: UserId
): AccessDeniedError | OrgNotFoundError | OrgUpstreamError => {
  if (isAPIError(error)) {
    if (error.statusCode === 403) {
      return new AccessDeniedError({ orgId, userId });
    }
    if (error.statusCode === 400 || error.statusCode === 404) {
      return new OrgNotFoundError({ orgId });
    }
  }
  return new OrgUpstreamError({ orgId, cause: error });
};

const getFullOrganization = Effect.fn("Org.getFullOrganization")(function* (
  auth: Auth,
  headers: Headers,
  orgId: OrgId,
  userId: UserId
) {
  yield* Effect.annotateCurrentSpan({ orgId: maskId(orgId) });

  const apiOrg = yield* Effect.tryPromise({
    catch: (error) => classifyFullOrgError(error, orgId, userId),
    try: () =>
      auth.api.getFullOrganization({
        headers,
        query: { organizationId: orgId },
      }),
  });

  if (!apiOrg) {
    return yield* OrgNotFoundError.make({ orgId });
  }

  // Defense-in-depth: reject if the caller isn't actually a member.
  const member = apiOrg.members.find((m) => m.userId === userId);
  if (!member) {
    return yield* AccessDeniedError.make({ orgId, userId });
  }

  return {
    id: apiOrg.id,
    name: apiOrg.name,
    role: member.role,
    slug: apiOrg.slug,
  };
});

const handleGetOrgRequest = Effect.fn("Org.handleGetOrgRequest")(function* (
  request: Request,
  orgId: OrgId
) {
  const auth = yield* AuthClient;
  const session = yield* getSession(auth, request.headers);
  return yield* getFullOrganization(
    auth,
    request.headers,
    orgId,
    UserId.make(session.user.id)
  );
});

export const handleGetOrg = (
  request: Request,
  orgId: OrgId,
  env: Env
): Promise<Response> =>
  runHandler(
    env,
    handleGetOrgRequest(request, orgId).pipe(
      Effect.tap(() =>
        Effect.logDebug("Get org success").pipe(
          Effect.annotateLogs({ orgId: maskId(orgId) })
        )
      ),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        AccessDeniedError: (e) =>
          Effect.logInfo("Get org access denied").pipe(
            Effect.annotateLogs({
              orgId: maskId(e.orgId),
              userId: maskId(e.userId),
            }),
            Effect.as(
              Response.json({ error: "Access denied" }, { status: 403 })
            )
          ),
        OrgNotFoundError: () =>
          Effect.logInfo("Get org not found").pipe(
            Effect.annotateLogs({ orgId: maskId(orgId) }),
            Effect.as(
              Response.json(
                { error: "Organization not found" },
                { status: 404 }
              )
            )
          ),
        OrgUpstreamError: (e) =>
          Effect.logError("Get org upstream error").pipe(
            Effect.annotateLogs({
              orgId: maskId(orgId),
              ...safeErrorInfo(e.cause),
            }),
            Effect.as(
              Response.json({ error: "Internal server error" }, { status: 500 })
            )
          ),
        OrgUnauthorizedError: () =>
          Effect.logDebug("Get org unauthorized").pipe(
            Effect.as(Response.json({ error: "Unauthorized" }, { status: 401 }))
          ),
      })
    )
  );
