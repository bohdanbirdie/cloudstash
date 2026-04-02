import { Effect, Layer, Schema } from "effect";

import type { OrgId } from "../db/branded";
import type { OrgFeatures } from "../db/schema";
import { DbClientLive } from "../db/service";
import { maskId } from "../log-utils";
import {
  OrgFeatures as OrgFeaturesService,
  OrgFeaturesLive,
} from "../org/features-service";
import type { Env } from "../shared";

class InvalidBodyError extends Schema.TaggedError<InvalidBodyError>()(
  "InvalidBodyError",
  {}
) {}

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

      yield* Effect.logInfo("List workspaces").pipe(Effect.annotateLogs({ count: workspaces.length }));
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
  orgId: OrgId,
  env: Env
): Promise<Response> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const orgFeatures = yield* OrgFeaturesService;
      const exists = yield* orgFeatures.exists(orgId);

      if (!exists) {
        yield* Effect.logInfo("Get org settings not found").pipe(Effect.annotateLogs({ orgId: maskId(orgId) }));
        return Response.json(
          { error: "Organization not found" },
          { status: 404 }
        );
      }

      const features = yield* orgFeatures.get(orgId);
      yield* Effect.logDebug("Get org settings").pipe(Effect.annotateLogs({ orgId: maskId(orgId) }));
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
  orgId: OrgId,
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
        yield* Effect.logInfo("Update org settings not found").pipe(Effect.annotateLogs({ orgId: maskId(orgId) }));
        return Response.json(
          { error: "Organization not found" },
          { status: 404 }
        );
      }

      yield* orgFeatures.update(orgId, body.features);

      yield* Effect.logInfo("Update org settings").pipe(
        Effect.annotateLogs({ orgId: maskId(orgId), features: Object.keys(body.features) })
      );
      return Response.json({ success: true, features: body.features });
    }).pipe(
      Effect.withSpan("Admin.handleUpdateOrgSettings"),
      Effect.provide(makeLayer(env)),
      Effect.catchTag("InvalidBodyError", () =>
        Effect.logWarning("Update org settings invalid body").pipe(
          Effect.annotateLogs({ orgId: maskId(orgId) }),
          Effect.as(Response.json({ error: "Invalid request body" }, { status: 400 }))
        )
      ),
      Effect.catchTag("DbError", () =>
        Effect.succeed(
          Response.json({ error: "Internal server error" }, { status: 500 })
        )
      )
    )
  );
}
