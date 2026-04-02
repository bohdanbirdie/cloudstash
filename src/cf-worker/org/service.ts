import { Effect, Layer } from "effect";

import { trackEvent } from "../analytics";
import type { Auth } from "../auth";
import { AppLayerLive, AuthClient } from "../auth/service";
import type { OrgId } from "../db/branded";
import { OrgId as OrgIdBrand } from "../db/branded";
import { maskId } from "../log-utils";
import type { Env } from "../shared";
import {
  AccessDeniedError,
  OrgNotFoundError,
  UnauthorizedError,
} from "./errors";
import { OrgFeatures, OrgFeaturesLive } from "./features-service";

const getSession = (auth: Auth, headers: Headers) =>
  Effect.tryPromise({
    catch: () => UnauthorizedError.make({}),
    try: () => auth.api.getSession({ headers }),
  }).pipe(
    Effect.flatMap((session) =>
      session ? Effect.succeed(session) : UnauthorizedError.make({})
    )
  );

const getOrgWithFeatures = Effect.fn("Org.getOrgWithFeatures")(function* (auth: Auth, headers: Headers, orgId: OrgId) {
    const apiOrg = yield* Effect.tryPromise({
      catch: () => OrgNotFoundError.make({ orgId }),
      try: () =>
        auth.api.getFullOrganization({
          headers,
          query: { organizationId: orgId },
        }),
    });

    if (!apiOrg) {
      return yield* OrgNotFoundError.make({ orgId });
    }

    const orgFeatures = yield* OrgFeatures;
    const features = yield* orgFeatures
      .get(orgId)
      .pipe(Effect.catchTag("DbError", () => OrgNotFoundError.make({ orgId })));

    return {
      id: apiOrg.id,
      name: apiOrg.name,
      slug: apiOrg.slug,
      features,
    };
  });

const handleGetMeRequest = Effect.fn("Org.handleGetMeRequest")(function* (request: Request) {
    const auth = yield* AuthClient;
    const session = yield* getSession(auth, request.headers);
    const rawOrgId = session.session.activeOrganizationId;

    const organization = rawOrgId
      ? yield* getOrgWithFeatures(auth, request.headers, OrgIdBrand.make(rawOrgId))
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
  Effect.runPromise(
    handleGetMeRequest(request).pipe(
      Effect.provide(Layer.provideMerge(OrgFeaturesLive, AppLayerLive(env))),
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
        OrgNotFoundError: () =>
          Effect.logInfo("Get me org not found").pipe(
            Effect.as(Response.json({ error: "Organization not found" }, { status: 404 }))
          ),
        UnauthorizedError: () =>
          Effect.logDebug("Get me unauthorized").pipe(
            Effect.as(Response.json({ error: "Unauthorized" }, { status: 401 }))
          ),
      }),
      Effect.catchAllDefect((defect) =>
        Effect.logError("Unexpected error in /me").pipe(
          Effect.annotateLogs({ error: defect instanceof Error ? defect.message : String(defect) }),
          Effect.as(Response.json({ error: "Internal server error" }, { status: 500 }))
        )
      )
    )
  ).catch((error: unknown) => {
    console.error("[Org] Unhandled error in /me", error instanceof Error ? error.message : String(error));
    return Response.json({ error: "Internal server error" }, { status: 500 });
  });

const getFullOrganization = (
  auth: Auth,
  headers: Headers,
  orgId: OrgId,
  userId: string
) =>
  Effect.tryPromise({
    catch: (error) => {
      const msg = error instanceof Error ? error.message : "";
      return msg.includes("not a member")
        ? AccessDeniedError.make({})
        : OrgNotFoundError.make({ orgId });
    },
    try: () =>
      auth.api.getFullOrganization({
        headers,
        query: { organizationId: orgId },
      }),
  }).pipe(
    Effect.flatMap((org) =>
      org ? Effect.succeed(org) : OrgNotFoundError.make({ orgId })
    ),
    Effect.flatMap((org) => {
      const member = org.members.find((m) => m.userId === userId);
      return member
        ? Effect.succeed({
            id: org.id,
            name: org.name,
            role: member.role,
            slug: org.slug,
          })
        : AccessDeniedError.make({});
    })
  );

const handleGetOrgRequest = Effect.fn("Org.handleGetOrgRequest")(function* (request: Request, orgId: OrgId) {
    const auth = yield* AuthClient;
    const session = yield* getSession(auth, request.headers);
    return yield* getFullOrganization(
      auth,
      request.headers,
      orgId,
      session.user.id
    );
  });

export const handleGetOrg = (
  request: Request,
  orgId: OrgId,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleGetOrgRequest(request, orgId).pipe(
      Effect.provide(Layer.provideMerge(OrgFeaturesLive, AppLayerLive(env))),
      Effect.tap(() =>
        Effect.logDebug("Get org success").pipe(
          Effect.annotateLogs({ orgId: maskId(orgId) })
        )
      ),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        AccessDeniedError: () =>
          Effect.logInfo("Get org access denied").pipe(
            Effect.annotateLogs({ orgId: maskId(orgId) }),
            Effect.as(Response.json({ error: "Access denied" }, { status: 403 }))
          ),
        OrgNotFoundError: () =>
          Effect.logInfo("Get org not found").pipe(
            Effect.annotateLogs({ orgId: maskId(orgId) }),
            Effect.as(Response.json({ error: "Organization not found" }, { status: 404 }))
          ),
        UnauthorizedError: () =>
          Effect.logDebug("Get org unauthorized").pipe(
            Effect.as(Response.json({ error: "Unauthorized" }, { status: 401 }))
          ),
      })
    )
  );
