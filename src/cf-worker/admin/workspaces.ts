import { Effect, Schema } from "effect";

import { PLAN_ORDER } from "@/lib/plan";

import { Billing } from "../billing/service";
import type { OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { runHandler } from "../runtime";
import type { Env } from "../shared";

class InvalidBodyError extends Schema.TaggedError<InvalidBodyError>()(
  "InvalidBodyError",
  {
    cause: Schema.Defect,
  }
) {}

export type { WorkspaceWithOwner } from "../billing/service";

const PlanTierSchema = Schema.Literal(...PLAN_ORDER);

const BOOLEAN_CAPABILITY_KEYS = [
  "aiSummary",
  "chatAgent",
  "integrations",
  "xBookmarkSync",
  "publicApi",
  "mcpServer",
] as const;

const NUMBER_CAPABILITY_KEYS = ["monthlyChatBudgetUsd"] as const;

const SetTierBody = Schema.Struct({ tier: PlanTierSchema });

const SetOverrideBody = Schema.Union(
  Schema.Struct({
    key: Schema.Literal(...BOOLEAN_CAPABILITY_KEYS),
    value: Schema.NullOr(Schema.Boolean),
  }),
  Schema.Struct({
    key: Schema.Literal(...NUMBER_CAPABILITY_KEYS),
    value: Schema.NullOr(Schema.Number),
  })
);

const decodeBody = <A, I>(request: Request, schema: Schema.Schema<A, I>) =>
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

const internalError = () =>
  Response.json({ error: "Internal server error" }, { status: 500 });

const notFound = () =>
  Response.json({ error: "Organization not found" }, { status: 404 });

const badBody = () =>
  Response.json({ error: "Invalid request body" }, { status: 400 });

export const handleListWorkspaces = (
  _request: Request,
  env: Env
): Promise<Response> =>
  runHandler(
    env,
    Effect.gen(function* () {
      const billing = yield* Billing;
      const workspaces = yield* billing.listWithOwners();
      yield* Effect.logInfo("List workspaces").pipe(
        Effect.annotateLogs({ count: workspaces.length })
      );
      return Response.json({ workspaces });
    }).pipe(
      Effect.withSpan("Admin.handleListWorkspaces"),
      Effect.catchTag("DbError", (cause) =>
        Effect.logError("listWorkspaces DbError").pipe(
          Effect.annotateLogs({ cause: String(cause) }),
          Effect.as(internalError())
        )
      )
    )
  );

export const handleGetOrgSettings = (
  _request: Request,
  orgId: OrgId,
  env: Env
): Promise<Response> =>
  runHandler(
    env,
    Effect.gen(function* () {
      const billing = yield* Billing;
      const tier = yield* billing.tier(orgId);
      const overrides = yield* billing.getOverrides(orgId);
      const capabilities = yield* billing.capabilities(orgId);
      yield* Effect.annotateCurrentSpan({ orgId: maskId(orgId), tier });
      yield* Effect.logDebug("Get org settings").pipe(
        Effect.annotateLogs({ orgId: maskId(orgId) })
      );
      return Response.json({ tier, overrides, capabilities });
    }).pipe(
      Effect.withSpan("Admin.handleGetOrgSettings"),
      Effect.catchTags({
        DbError: (cause) =>
          Effect.logError("getOrgSettings DbError").pipe(
            Effect.annotateLogs({ cause: String(cause) }),
            Effect.as(internalError())
          ),
        OrgNotFoundError: () => Effect.succeed(notFound()),
      })
    )
  );

export const handleSetTier = (
  request: Request,
  orgId: OrgId,
  env: Env
): Promise<Response> =>
  runHandler(
    env,
    Effect.gen(function* () {
      const body = yield* decodeBody(request, SetTierBody);
      const billing = yield* Billing;
      yield* billing.setTier(orgId, body.tier);
      yield* Effect.annotateCurrentSpan({
        orgId: maskId(orgId),
        tier: body.tier,
      });
      yield* Effect.logInfo("Set tier").pipe(
        Effect.annotateLogs({ orgId: maskId(orgId), tier: body.tier })
      );
      return Response.json({ success: true, tier: body.tier });
    }).pipe(
      Effect.withSpan("Admin.handleSetTier"),
      Effect.catchTags({
        InvalidBodyError: () => Effect.succeed(badBody()),
        DbError: (cause) =>
          Effect.logError("setTier DbError").pipe(
            Effect.annotateLogs({ cause: String(cause) }),
            Effect.as(internalError())
          ),
        OrgNotFoundError: () => Effect.succeed(notFound()),
      })
    )
  );

export const handleSetOverride = (
  request: Request,
  orgId: OrgId,
  env: Env
): Promise<Response> =>
  runHandler(
    env,
    Effect.gen(function* () {
      const body = yield* decodeBody(request, SetOverrideBody);
      const billing = yield* Billing;
      yield* billing.setOverride(orgId, body.key, body.value);
      yield* Effect.annotateCurrentSpan({
        orgId: maskId(orgId),
        key: body.key,
        cleared: body.value === null,
      });
      yield* Effect.logInfo("Set override").pipe(
        Effect.annotateLogs({
          orgId: maskId(orgId),
          key: body.key,
          cleared: body.value === null,
        })
      );
      return Response.json({ success: true });
    }).pipe(
      Effect.withSpan("Admin.handleSetOverride"),
      Effect.catchTags({
        InvalidBodyError: () => Effect.succeed(badBody()),
        DbError: (cause) =>
          Effect.logError("setOverride DbError").pipe(
            Effect.annotateLogs({ cause: String(cause) }),
            Effect.as(internalError())
          ),
        OrgNotFoundError: () => Effect.succeed(notFound()),
      })
    )
  );
