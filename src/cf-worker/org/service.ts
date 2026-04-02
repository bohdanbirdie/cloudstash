import { Effect, Layer } from "effect";

import { trackEvent } from "../analytics";
import type { Auth } from "../auth";
import { AppLayerLive, AuthClient } from "../auth/service";
import { maskId } from "../log-utils";
import { logSync } from "../logger";
import type { Env } from "../shared";
import {
  AccessDeniedError,
  OrgNotFoundError,
  UnauthorizedError,
} from "./errors";
import { OrgFeatures, OrgFeaturesLive } from "./features-service";

const logger = logSync("Org");

const getSession = (auth: Auth, headers: Headers) =>
  Effect.tryPromise({
    catch: () => UnauthorizedError.make({}),
    try: () => auth.api.getSession({ headers }),
  }).pipe(
    Effect.flatMap((session) =>
      session ? Effect.succeed(session) : UnauthorizedError.make({})
    )
  );

const getOrgWithFeatures = Effect.fn("Org.getOrgWithFeatures")(function* (auth: Auth, headers: Headers, orgId: string) {
    const apiOrg = yield* Effect.tryPromise({
      catch: () => OrgNotFoundError.make({}),
      try: () =>
        auth.api.getFullOrganization({
          headers,
          query: { organizationId: orgId },
        }),
    });

    if (!apiOrg) {
      return yield* OrgNotFoundError.make({});
    }

    const orgFeatures = yield* OrgFeatures;
    const features = yield* orgFeatures
      .get(orgId)
      .pipe(Effect.catchTag("DbError", () => OrgNotFoundError.make({})));

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
    const orgId = session.session.activeOrganizationId;

    const organization = orgId
      ? yield* getOrgWithFeatures(auth, request.headers, orgId)
      : null;

    return {
      organization,
      session: { activeOrganizationId: orgId ?? null },
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
        Effect.sync(() => {
          logger.debug("Get me success", {
            hasOrg: !!data.organization,
            orgId: data.organization ? maskId(data.organization.id) : null,
          });
          trackEvent(env.USAGE_ANALYTICS, {
            userId: data.user.id,
            event: "auth",
            orgId: data.organization?.id ?? "",
          });
        })
      ),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        OrgNotFoundError: () => {
          logger.info("Get me org not found");
          return Effect.succeed(
            Response.json({ error: "Organization not found" }, { status: 404 })
          );
        },
        UnauthorizedError: () => {
          logger.debug("Get me unauthorized");
          return Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          );
        },
      }),
      Effect.catchAllDefect((defect) => {
        logger.error("Unexpected error in /me", {
          error: defect instanceof Error ? defect.message : String(defect),
        });
        return Effect.succeed(
          Response.json({ error: "Internal server error" }, { status: 500 })
        );
      })
    )
  ).catch((error: unknown) => {
    logger.error("Unhandled error in /me", {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Internal server error" }, { status: 500 });
  });

const getFullOrganization = (
  auth: Auth,
  headers: Headers,
  orgId: string,
  userId: string
) =>
  Effect.tryPromise({
    catch: (error) => {
      const msg = error instanceof Error ? error.message : "";
      return msg.includes("not a member")
        ? AccessDeniedError.make({})
        : OrgNotFoundError.make({});
    },
    try: () =>
      auth.api.getFullOrganization({
        headers,
        query: { organizationId: orgId },
      }),
  }).pipe(
    Effect.flatMap((org) =>
      org ? Effect.succeed(org) : OrgNotFoundError.make({})
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

const handleGetOrgRequest = Effect.fn("Org.handleGetOrgRequest")(function* (request: Request, orgId: string) {
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
  orgId: string,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    handleGetOrgRequest(request, orgId).pipe(
      Effect.provide(Layer.provideMerge(OrgFeaturesLive, AppLayerLive(env))),
      Effect.tap(() =>
        Effect.sync(() =>
          logger.debug("Get org success", { orgId: maskId(orgId) })
        )
      ),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags({
        AccessDeniedError: () => {
          logger.info("Get org access denied", { orgId: maskId(orgId) });
          return Effect.succeed(
            Response.json({ error: "Access denied" }, { status: 403 })
          );
        },
        OrgNotFoundError: () => {
          logger.info("Get org not found", { orgId: maskId(orgId) });
          return Effect.succeed(
            Response.json({ error: "Organization not found" }, { status: 404 })
          );
        },
        UnauthorizedError: () => {
          logger.debug("Get org unauthorized");
          return Effect.succeed(
            Response.json({ error: "Unauthorized" }, { status: 401 })
          );
        },
      })
    )
  );
