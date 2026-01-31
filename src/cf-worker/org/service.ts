import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { type MeResponse } from "@/types/api";

import { createAuth } from "../auth";
import { createDb } from "../db";
import * as schema from "../db/schema";
import { type OrgFeatures } from "../db/schema";
import { maskId } from "../log-utils";
import { logSync } from "../logger";
import { type Env } from "../shared";
import {
  AccessDeniedError,
  OrgNotFoundError,
  UnauthorizedError,
} from "./errors";

const logger = logSync("Org");

type Auth = ReturnType<typeof createAuth>;

const getSession = (auth: Auth, headers: Headers) =>
  Effect.tryPromise({
    catch: () => UnauthorizedError.make({}),
    try: () => auth.api.getSession({ headers }),
  }).pipe(
    Effect.flatMap((session) =>
      session ? Effect.succeed(session) : UnauthorizedError.make({})
    )
  );

const getOrgWithFeatures = (
  auth: Auth,
  headers: Headers,
  db: ReturnType<typeof createDb>,
  orgId: string
): Effect.Effect<MeResponse["organization"], OrgNotFoundError> =>
  Effect.gen(function* () {
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

    const dbOrg = yield* Effect.tryPromise({
      catch: () => OrgNotFoundError.make({}),
      try: () =>
        db.query.organization.findFirst({
          where: eq(schema.organization.id, orgId),
          columns: { features: true },
        }),
    });

    return {
      id: apiOrg.id,
      name: apiOrg.name,
      slug: apiOrg.slug,
      features: (dbOrg?.features as OrgFeatures) ?? {},
    };
  });

const handleGetMeRequest = (
  request: Request,
  env: Env
): Effect.Effect<MeResponse, UnauthorizedError | OrgNotFoundError> =>
  Effect.gen(function* () {
    const db = createDb(env.DB);
    const auth = createAuth(env, db);
    const session = yield* getSession(auth, request.headers);
    const orgId = session.session.activeOrganizationId;

    const organization = orgId
      ? yield* getOrgWithFeatures(auth, request.headers, db, orgId)
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
    handleGetMeRequest(request, env).pipe(
      Effect.tap((data) =>
        Effect.sync(() =>
          logger.debug("Get me success", {
            hasOrg: !!data.organization,
            orgId: data.organization ? maskId(data.organization.id) : null,
          })
        )
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
      })
    )
  );

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

const handleGetOrgRequest = (request: Request, orgId: string, env: Env) =>
  Effect.gen(function* handleGetOrgRequest() {
    const auth = createAuth(env, createDb(env.DB));
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
    handleGetOrgRequest(request, orgId, env).pipe(
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
