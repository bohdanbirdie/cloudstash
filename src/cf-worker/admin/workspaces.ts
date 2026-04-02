import { Data, Effect, Layer } from "effect";

import type { OrgFeatures } from "../db/schema";
import { DbClientLive } from "../db/service";
import { maskId } from "../log-utils";
import { logSync } from "../logger";
import {
  OrgFeatures as OrgFeaturesService,
  OrgFeaturesLive,
} from "../org/features-service";
import type { Env } from "../shared";

const logger = logSync("Admin");

class InvalidBodyError extends Data.TaggedError("InvalidBodyError") {}

export type { WorkspaceWithOwner } from "../org/features-service";

const makeLayer = (env: Env) =>
  Layer.provideMerge(OrgFeaturesLive, DbClientLive(env.DB));

export async function handleListWorkspaces(
  _request: Request,
  env: Env
): Promise<Response> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const orgFeatures = yield* OrgFeaturesService;
      const workspaces = yield* orgFeatures.listWithOwners();

      logger.info("List workspaces", { count: workspaces.length });
      return Response.json({ workspaces });
    }).pipe(
      Effect.withSpan("Admin.handleListWorkspaces"),
      Effect.provide(makeLayer(env)),
      Effect.catchTag("DbError", () =>
        Effect.succeed(
          Response.json({ error: "Internal server error" }, { status: 500 })
        )
      )
    )
  );
}

export async function handleGetOrgSettings(
  _request: Request,
  orgId: string,
  env: Env
): Promise<Response> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const orgFeatures = yield* OrgFeaturesService;
      const exists = yield* orgFeatures.exists(orgId);

      if (!exists) {
        logger.info("Get org settings not found", { orgId: maskId(orgId) });
        return Response.json(
          { error: "Organization not found" },
          { status: 404 }
        );
      }

      const features = yield* orgFeatures.get(orgId);
      logger.debug("Get org settings", { orgId: maskId(orgId) });
      return Response.json({ features });
    }).pipe(
      Effect.withSpan("Admin.handleGetOrgSettings"),
      Effect.provide(makeLayer(env)),
      Effect.catchTag("DbError", () =>
        Effect.succeed(
          Response.json({ error: "Internal server error" }, { status: 500 })
        )
      )
    )
  );
}

export async function handleUpdateOrgSettings(
  request: Request,
  orgId: string,
  env: Env
): Promise<Response> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const orgFeatures = yield* OrgFeaturesService;

      const body = yield* Effect.tryPromise({
        try: (): Promise<{ features: OrgFeatures }> => request.json(),
        catch: () => new InvalidBodyError(),
      });

      const exists = yield* orgFeatures.exists(orgId);
      if (!exists) {
        logger.info("Update org settings not found", { orgId: maskId(orgId) });
        return Response.json(
          { error: "Organization not found" },
          { status: 404 }
        );
      }

      yield* orgFeatures.update(orgId, body.features);

      logger.info("Update org settings", {
        orgId: maskId(orgId),
        features: Object.keys(body.features),
      });
      return Response.json({ success: true, features: body.features });
    }).pipe(
      Effect.withSpan("Admin.handleUpdateOrgSettings"),
      Effect.provide(makeLayer(env)),
      Effect.catchTag("InvalidBodyError", () => {
        logger.warn("Update org settings invalid body", {
          orgId: maskId(orgId),
        });
        return Effect.succeed(
          Response.json({ error: "Invalid request body" }, { status: 400 })
        );
      }),
      Effect.catchTag("DbError", () =>
        Effect.succeed(
          Response.json({ error: "Internal server error" }, { status: 500 })
        )
      )
    )
  );
}
