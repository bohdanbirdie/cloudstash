import { Effect, Layer, Result, Schema } from "effect";

import { PLAN_ORDER } from "@/lib/plan";

import { Billing } from "../billing/service";
import type { OrgId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import { runHandler } from "../runtime";
import type { Env } from "../shared";
import {
  DigestScheduleReconcilerLive,
  reconcileDigestSchedule,
} from "../weekly-digest/reconcile";
import { XReconcileQueue } from "../x-sync/reconcile-queue";
import { enqueueOrgXReconcile } from "../x-sync/reconcile-triggers";

class InvalidBodyError extends Schema.TaggedErrorClass<InvalidBodyError>()(
  "InvalidBodyError",
  {
    cause: Schema.Defect(),
  }
) {}

export type { WorkspaceWithOwner } from "../billing/service";

const PlanTierSchema = Schema.Literals(PLAN_ORDER);

const BOOLEAN_CAPABILITY_KEYS = [
  "aiSummary",
  "chatAgent",
  "integrations",
  "xBookmarkSync",
  "xContentEnrichment",
  "publicApi",
  "mcpServer",
  "weeklyDigest",
] as const;

const NUMBER_CAPABILITY_KEYS = ["monthlyAssistantCredits"] as const;

const SetTierBody = Schema.Struct({ tier: PlanTierSchema });

const SetOverrideBody = Schema.Union([
  Schema.Struct({
    key: Schema.Literals(BOOLEAN_CAPABILITY_KEYS),
    value: Schema.NullOr(Schema.Boolean),
  }),
  Schema.Struct({
    key: Schema.Literals(NUMBER_CAPABILITY_KEYS),
    value: Schema.NullOr(Schema.Number),
  }),
]);

const decodeBody = <A, I>(request: Request, schema: Schema.Codec<A, I>) =>
  Effect.tryPromise({
    try: () => request.json(),
    catch: (cause) => new InvalidBodyError({ cause }),
  }).pipe(
    Effect.flatMap((raw) =>
      Schema.decodeUnknownEffect(schema)(raw).pipe(
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

export const reconcileTierDependents = Effect.fn(
  "Admin.reconcileTierDependents"
)(function* (orgId: OrgId) {
  const results = yield* Effect.all(
    {
      digest: reconcileDigestSchedule(orgId),
      x: enqueueOrgXReconcile(orgId),
    },
    { concurrency: "unbounded", mode: "result" }
  );

  if (Result.isFailure(results.x)) {
    yield* Effect.logError("setTier X reconciliation failed").pipe(
      Effect.annotateLogs(safeErrorInfo(results.x.failure))
    );
  }
  if (Result.isFailure(results.digest)) {
    yield* Effect.logError("setTier digest reconciliation failed").pipe(
      Effect.annotateLogs(safeErrorInfo(results.digest.failure.cause))
    );
  }

  return Result.isFailure(results.x) || Result.isFailure(results.digest);
});

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
      const reconciliationFailed = yield* reconcileTierDependents(orgId);
      yield* Effect.annotateCurrentSpan({
        orgId: maskId(orgId),
        tier: body.tier,
      });
      yield* Effect.logInfo("Set tier").pipe(
        Effect.annotateLogs({ orgId: maskId(orgId), tier: body.tier })
      );
      if (reconciliationFailed) return internalError();
      return Response.json({ success: true, tier: body.tier });
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          DigestScheduleReconcilerLive(env),
          XReconcileQueue.layer(env.X_RECONCILE_QUEUE)
        )
      ),
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
      if (body.key === "xBookmarkSync") {
        yield* enqueueOrgXReconcile(orgId);
      }
      if (body.key === "weeklyDigest") {
        yield* reconcileDigestSchedule(orgId);
      }
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
      Effect.provide(
        Layer.mergeAll(
          DigestScheduleReconcilerLive(env),
          XReconcileQueue.layer(env.X_RECONCILE_QUEUE)
        )
      ),
      Effect.withSpan("Admin.handleSetOverride"),
      Effect.catchTags({
        InvalidBodyError: () => Effect.succeed(badBody()),
        DbError: (cause) =>
          Effect.logError("setOverride DbError").pipe(
            Effect.annotateLogs({ cause: String(cause) }),
            Effect.as(internalError())
          ),
        OrgNotFoundError: () => Effect.succeed(notFound()),
        DigestScheduleReconcileError: (error) =>
          Effect.logError("setOverride digest reconciliation failed").pipe(
            Effect.annotateLogs(safeErrorInfo(error.cause)),
            Effect.as(internalError())
          ),
        XReconcileQueueError: () => Effect.succeed(internalError()),
      })
    )
  );
