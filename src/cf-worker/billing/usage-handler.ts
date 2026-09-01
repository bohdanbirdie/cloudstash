import { Effect, Layer, Option, Schema } from "effect";

import { WorkspaceUsageResponse } from "@/lib/usage-api";
import type { UsageItem } from "@/lib/usage-api";

import { checkSyncAuth } from "../auth/sync-auth";
import { assistantCreditStatus, parseAiMeterLimit } from "../chat-agent/usage";
import { OrgId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import { getAppLayer } from "../runtime";
import type { Env } from "../shared";
import { resolveWorkspaceAllowance } from "./assistant-allowance";
import { StripeClientLive } from "./stripe-client";

class UsageRpcError extends Schema.TaggedError<UsageRpcError>()(
  "UsageRpcError",
  { cause: Schema.Defect() }
) {}

const remaining = (limit: number, used: number) =>
  Math.max(0, limit - Math.min(limit, used));

export const workspaceUsage = Effect.fn("Billing.workspaceUsage")(function* (
  request: Request,
  env: Env,
  orgId: OrgId
) {
  yield* checkSyncAuth(request.headers.get("cookie"), orgId);
  const allowance = yield* resolveWorkspaceAllowance(orgId);
  const window = yield* Option.match(allowance.usageWindow, {
    onNone: () => Effect.fail(new UsageRpcError({ cause: "missing_window" })),
    onSome: Effect.succeed,
  });
  const processor = env.LINK_PROCESSOR_DO.get(
    env.LINK_PROCESSOR_DO.idFromName(orgId)
  );
  const [counted, xBookmarks, chat] = yield* Effect.tryPromise({
    try: () =>
      Promise.all([
        processor.getCountedUsage(window.id),
        processor.getXBookmarkUsage(window.id),
        processor.getChatUsage(window.id),
      ]),
    catch: (cause) => new UsageRpcError({ cause }),
  });
  const capabilities = allowance.capabilities;
  const items: UsageItem[] = [];

  if (capabilities.monthlyAiSummaries > 0) {
    items.push({
      id: "aiSummaries",
      label: "AI summaries",
      limit: capabilities.monthlyAiSummaries,
      remaining: remaining(
        capabilities.monthlyAiSummaries,
        counted?.aiSummaries ?? 0
      ),
    });
  }
  if (capabilities.monthlyAssistantCredits > 0) {
    const privateLimit = parseAiMeterLimit(env.AI_METER_LIMIT);
    if (privateLimit === undefined) {
      return yield* new UsageRpcError({ cause: "assistant_meter_unavailable" });
    }
    const credits = assistantCreditStatus(
      chat,
      capabilities.monthlyAssistantCredits,
      privateLimit,
      window.resetsAt
    );
    items.push({
      id: "assistant",
      label: "Cloudstash Assistant",
      limit: credits.limit,
      remaining: credits.remaining,
    });
  }
  if (capabilities.monthlyExternalCalls > 0) {
    items.push({
      id: "externalCalls",
      label: capabilities.mcpServer ? "API and MCP calls" : "API calls",
      limit: capabilities.monthlyExternalCalls,
      remaining: remaining(
        capabilities.monthlyExternalCalls,
        counted?.externalCalls ?? 0
      ),
    });
  }
  if (capabilities.monthlyXBookmarks > 0) {
    items.push({
      id: "xBookmarks",
      label: "X bookmark sync",
      limit: capabilities.monthlyXBookmarks,
      remaining: remaining(
        capabilities.monthlyXBookmarks,
        xBookmarks?.count ?? 0
      ),
    });
  }
  if (capabilities.monthlyXEnrichments > 0) {
    items.push({
      id: "xEnrichments",
      label: "Enriched X summaries",
      limit: capabilities.monthlyXEnrichments,
      remaining: remaining(
        capabilities.monthlyXEnrichments,
        counted?.xEnrichments ?? 0
      ),
    });
  }

  return WorkspaceUsageResponse.make({ items, resetsAt: window.resetsAt });
});

export const handleWorkspaceUsage = (request: Request, env: Env) => {
  const rawOrgId = new URL(request.url).searchParams.get("workspaceId");
  if (!rawOrgId) {
    return Promise.resolve(
      Response.json({ error: "Missing workspaceId" }, { status: 400 })
    );
  }
  const orgId = OrgId.make(rawOrgId);
  return workspaceUsage(request, env, orgId).pipe(
    Effect.map((usage) => Response.json(usage)),
    Effect.catchTag("SyncAuthError", (error) =>
      Effect.succeed(
        Response.json(error, { status: error.status as 401 | 403 | 503 })
      )
    ),
    Effect.catchCause((cause) =>
      Effect.logError("Workspace usage unavailable").pipe(
        Effect.annotateLogs({ orgId: maskId(orgId), ...safeErrorInfo(cause) }),
        Effect.as(
          Response.json(
            { error: "Usage is temporarily unavailable" },
            { status: 503 }
          )
        )
      )
    ),
    Effect.provide(Layer.merge(getAppLayer(env), StripeClientLive(env))),
    Effect.runPromise
  );
};
