import { Effect, Option, Schema } from "effect";

import { bearerApiKey } from "../auth/bearer-api-key";
import { WorkspaceAccess } from "../auth/workspace-access";
import { workspaceAccessHttpResponse } from "../auth/workspace-access-http";
import { capabilityDeniedResponse } from "../billing/errors";
import { requireCapability } from "../billing/service";
import type { ApiKey, OrgId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import { runHandler } from "../runtime";
import type { Env } from "../shared";
import { parseListParams } from "./api";
import type { ParsedListParams } from "./api";

type ListParams = Extract<ParsedListParams, { ok: true }>;

export class LinksReadError extends Schema.TaggedErrorClass<LinksReadError>()(
  "LinksReadError",
  { cause: Schema.Defect() }
) {}

const unauthorized = (): Response =>
  Response.json({ error: "Unauthorized" }, { status: 401 });

export const fetchLinksPage = Effect.fn("Links.fetchPage")(function* (
  orgId: OrgId,
  params: ListParams,
  env: Env
) {
  return yield* Effect.tryPromise({
    try: () =>
      env.Chat.get(env.Chat.idFromName(orgId)).listLinks({
        state: params.state,
        limit: params.limit,
        cursor: params.cursor,
      }),
    catch: (cause) => new LinksReadError({ cause }),
  });
});

export const searchWorkspaceLinks = Effect.fn("Links.searchWorkspace")(
  function* (orgId: OrgId, query: string, env: Env) {
    yield* Effect.annotateCurrentSpan("orgId", maskId(orgId));
    const results = yield* Effect.tryPromise({
      try: () =>
        env.Chat.get(env.Chat.idFromName(orgId)).searchLinks({ query }),
      catch: (cause) => new LinksReadError({ cause }),
    });
    yield* Effect.annotateCurrentSpan("resultCount", results.length);
    return results;
  }
);

export const listLinksEffect = Effect.fn("LinksApi.listLinks")(function* (
  apiKey: ApiKey,
  params: ListParams,
  env: Env
) {
  const workspaceAccess = yield* WorkspaceAccess;
  const authorization = yield* workspaceAccess.authorizeApiKey(apiKey).pipe(
    Effect.matchEffect({
      onFailure: workspaceAccessHttpResponse,
      onSuccess: Effect.succeed,
    })
  );
  if (authorization instanceof Response) {
    return authorization;
  }
  const { orgId } = authorization;
  yield* Effect.annotateCurrentSpan("orgId", maskId(orgId));

  const denied = yield* requireCapability(orgId, "publicApi").pipe(
    Effect.as<Response | null>(null),
    Effect.catchTags({
      CapabilityDisabledError: (e) =>
        Effect.succeed(capabilityDeniedResponse(e)),
      OrgNotFoundError: () =>
        Effect.logWarning("Links API: org not found").pipe(
          Effect.annotateLogs({ orgId: maskId(orgId) }),
          Effect.as(
            Response.json({ error: "Organization not found" }, { status: 404 })
          )
        ),
      DbError: (cause) =>
        Effect.logError("Links API: capability check failed").pipe(
          Effect.annotateLogs({
            orgId: maskId(orgId),
            ...safeErrorInfo(cause),
          }),
          Effect.as(Response.json({ error: "Internal error" }, { status: 500 }))
        ),
    })
  );
  if (denied) return denied;

  const page = yield* fetchLinksPage(orgId, params, env).pipe(
    Effect.catch((error) =>
      Effect.logError("Links API: listLinks RPC failed").pipe(
        Effect.annotateLogs({
          orgId: maskId(orgId),
          ...safeErrorInfo(error.cause),
        }),
        Effect.as(null)
      )
    )
  );
  if (!page) {
    return Response.json({ error: "Internal error" }, { status: 500 });
  }

  return Response.json(page);
});

export const handleListLinks = (
  request: Request,
  env: Env
): Promise<Response> => {
  const apiKey = bearerApiKey(request.headers);
  if (Option.isNone(apiKey)) return Promise.resolve(unauthorized());

  const params = parseListParams(new URL(request.url));
  if (!params.ok) {
    return Promise.resolve(
      Response.json({ error: params.error }, { status: 400 })
    );
  }

  return runHandler(env, listLinksEffect(apiKey.value, params, env));
};
