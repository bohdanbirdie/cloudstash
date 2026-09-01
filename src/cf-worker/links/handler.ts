import { Data, Effect, Option, Schema } from "effect";

import {
  GetLinkInput,
  LinkChanges,
  ListLinksInput,
  SaveLinkInput,
  SearchLinksInput,
  UpdateLinksInput,
} from "@/lib/links-contract";

import { trackEvent } from "../analytics";
import { bearerApiKey } from "../auth/bearer-api-key";
import type { AuthClient } from "../auth/service";
import {
  WorkspaceAccess,
  WorkspaceAccessError,
} from "../auth/workspace-access";
import { workspaceAccessHttpResponse } from "../auth/workspace-access-http";
import {
  CapabilityDisabledError,
  capabilityDeniedResponse,
} from "../billing/errors";
import {
  ExternalCallAllowanceUnavailableError,
  ExternalCallLimitReachedError,
  reserveExternalCall,
} from "../billing/external-call-meter";
import { requireCapability } from "../billing/service";
import type { Billing } from "../billing/service";
import type { ApiKey, OrgId, UserId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import { OrgNotFoundError } from "../org/errors";
import { runHandler } from "../runtime";
import type { AppCtx } from "../runtime";
import type { Env } from "../shared";
import type {
  SaveLinkRpcInput,
  WorkspaceLinksRpcResult,
} from "../workspace-links/rpc";

export const MAX_LINK_MUTATION_BODY_BYTES = 64 * 1024;

export const linkMutationBodyTooLargeResponse = (): Response =>
  Response.json({ error: "Request body too large" }, { status: 413 });

class LinksApiAccessError extends Data.TaggedError("LinksApiAccessError")<{
  readonly cause: WorkspaceAccessError;
}> {}

class LinksApiRequestError extends Data.TaggedError("LinksApiRequestError")<{
  readonly message: string;
  readonly status: 400 | 404 | 429;
}> {}

class LinksApiInternalError extends Data.TaggedError("LinksApiInternalError")<{
  readonly cause: unknown;
  readonly operation: string;
  readonly orgId: string;
}> {}

class LinksApiUnavailableError extends Data.TaggedError(
  "LinksApiUnavailableError"
)<{ readonly message: string }> {}

type LinksApiError =
  | LinksApiAccessError
  | LinksApiRequestError
  | LinksApiInternalError
  | LinksApiUnavailableError
  | ExternalCallAllowanceUnavailableError
  | ExternalCallLimitReachedError
  | CapabilityDisabledError
  | OrgNotFoundError;

const requestError = (message: string, status: 400 | 404 | 429 = 400) =>
  new LinksApiRequestError({ message, status });

const unauthorized = (): Response =>
  Response.json({ error: "Unauthorized" }, { status: 401 });

const decode = <S extends Schema.Top>(schema: S, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(() => requestError("Invalid request"))
  );

const jsonBody = (request: Request) =>
  Effect.tryPromise(() => request.json<unknown>()).pipe(
    Effect.mapError(() => requestError("Invalid JSON body"))
  );

const rpcValue = <Value>(
  result: WorkspaceLinksRpcResult<Value>
): Effect.Effect<Value, LinksApiRequestError | LinksApiUnavailableError> => {
  if (result.ok) return Effect.succeed(result.value);
  if (result.error.code === "unavailable") {
    return Effect.fail(
      new LinksApiUnavailableError({ message: result.error.message })
    );
  }
  if (result.error.code === "limit_reached") {
    return Effect.fail(requestError(result.error.message, 429));
  }
  return Effect.fail(
    requestError(
      result.error.message,
      result.error.code === "not_found" ? 404 : 400
    )
  );
};

const callRpc = <Value>(
  orgId: OrgId,
  operation: string,
  call: () => Promise<WorkspaceLinksRpcResult<Value>>
) =>
  Effect.tryPromise({
    try: call,
    catch: (cause) =>
      new LinksApiInternalError({
        cause,
        operation,
        orgId: maskId(orgId),
      }),
  }).pipe(Effect.flatMap(rpcValue));

const authorize = Effect.fnUntraced(function* (apiKey: ApiKey, env: Env) {
  const access = yield* WorkspaceAccess;
  const authorization = yield* access
    .authorizeApiKey(apiKey)
    .pipe(Effect.mapError((cause) => new LinksApiAccessError({ cause })));
  const orgId = maskId(authorization.orgId);
  yield* requireCapability(authorization.orgId, "publicApi").pipe(
    Effect.catchTag(
      "DbError",
      (error) =>
        new LinksApiInternalError({
          cause: error.cause,
          operation: "capabilityCheck",
          orgId,
        })
    )
  );
  yield* reserveExternalCall(env, authorization.orgId).pipe(
    Effect.catchTags({
      DbError: (error) =>
        new LinksApiInternalError({
          cause: error.cause,
          operation: "externalCallAllowance",
          orgId,
        }),
      ExternalCallMeterError: (error) =>
        new LinksApiInternalError({
          cause: error.cause,
          operation: "externalCallReservation",
          orgId,
        }),
      ExternalCallWorkspaceUnavailableError: () =>
        new LinksApiUnavailableError({ message: "Library is unavailable" }),
    })
  );
  yield* Effect.annotateCurrentSpan("orgId", orgId);
  return authorization;
});

const stub = (env: Env, orgId: OrgId) =>
  env.LINK_PROCESSOR_DO.get(env.LINK_PROCESSOR_DO.idFromName(orgId));

const queryInput = (url: URL): Record<string, unknown> => {
  const input: Record<string, unknown> = {};
  for (const name of [
    "state",
    "match",
    "cursor",
    "sort",
    "createdAfter",
    "createdBefore",
  ]) {
    const value = url.searchParams.get(name);
    if (value !== null) input[name] = value;
  }
  const limit = url.searchParams.get("limit");
  if (limit !== null) input.limit = Number(limit);
  return input;
};

const toResponse = <Value, Requirements extends AppCtx>(
  effect: Effect.Effect<Value, LinksApiError, Requirements>
): Effect.Effect<Response, never, Requirements> =>
  effect.pipe(
    Effect.map((value) => Response.json(value)),
    Effect.catchTag("LinksApiRequestError", (error) =>
      Effect.succeed(
        Response.json({ error: error.message }, { status: error.status })
      )
    ),
    Effect.catchTag("LinksApiAccessError", (error) =>
      workspaceAccessHttpResponse(error.cause)
    ),
    Effect.catchTag("LinksApiUnavailableError", (error) =>
      Effect.succeed(Response.json({ error: error.message }, { status: 410 }))
    ),
    Effect.catchTag("ExternalCallLimitReachedError", (error) =>
      Effect.succeed(
        Response.json(
          {
            error: "Monthly API allowance used",
            resetsAt: error.resetsAt,
          },
          { status: 429 }
        )
      )
    ),
    Effect.catchTag("ExternalCallAllowanceUnavailableError", () =>
      Effect.succeed(
        Response.json(
          { error: "Usage allowance is temporarily unavailable" },
          { status: 503 }
        )
      )
    ),
    Effect.catchTags({
      CapabilityDisabledError: (error) =>
        Effect.succeed(capabilityDeniedResponse(error)),
      OrgNotFoundError: () =>
        Effect.succeed(
          Response.json({ error: "Library not found" }, { status: 404 })
        ),
      LinksApiInternalError: (error) =>
        Effect.logError("Links API operation failed").pipe(
          Effect.annotateLogs({
            ...safeErrorInfo(error.cause),
            operation: error.operation,
            orgId: error.orgId,
          }),
          Effect.as(Response.json({ error: "Internal error" }, { status: 500 }))
        ),
    })
  );

const withApiKey = (
  request: Request,
  env: Env,
  span: string,
  operation: (apiKey: ApiKey) => Effect.Effect<Response, never, AppCtx>
): Promise<Response> => {
  const apiKey = bearerApiKey(request.headers);
  if (Option.isNone(apiKey)) return Promise.resolve(unauthorized());
  return runHandler(env, operation(apiKey.value).pipe(Effect.withSpan(span)));
};

export const handleListLinks = (
  request: Request,
  env: Env
): Promise<Response> =>
  withApiKey(request, env, "LinksApi.listLinks", (apiKey) =>
    listLinksEffect(apiKey, request, env)
  );

export const listLinksEffect = (
  apiKey: ApiKey,
  request: Request,
  env: Env
): Effect.Effect<Response, never, AuthClient | Billing | WorkspaceAccess> =>
  toResponse(
    Effect.gen(function* () {
      const authorization = yield* authorize(apiKey, env);
      const url = new URL(request.url);
      const q = url.searchParams.get("q");
      if (q !== null) {
        const input = yield* decode(SearchLinksInput, {
          ...queryInput(url),
          query: q,
        });
        const links = yield* callRpc(authorization.orgId, "searchLinks", () =>
          stub(env, authorization.orgId).searchLinks(input)
        );
        return { links, total: links.length, nextCursor: null };
      }
      const input = yield* decode(ListLinksInput, queryInput(url));
      return yield* callRpc(authorization.orgId, "listLinks", () =>
        stub(env, authorization.orgId).listLinks(input)
      );
    })
  );

export const handleGetLink = (
  request: Request,
  id: string,
  env: Env
): Promise<Response> =>
  withApiKey(request, env, "LinksApi.getLink", (apiKey) =>
    toResponse(
      Effect.gen(function* () {
        const authorization = yield* authorize(apiKey, env);
        const input = yield* decode(GetLinkInput, { id });
        return yield* callRpc(authorization.orgId, "getLink", () =>
          stub(env, authorization.orgId).getLink(input)
        );
      })
    )
  );

const mutation = <Value>(
  request: Request,
  env: Env,
  span: string,
  operation: (authorization: {
    readonly orgId: OrgId;
    readonly userId: UserId;
  }) => Effect.Effect<Value, LinksApiError>
): Promise<Response> =>
  withApiKey(request, env, span, (apiKey) =>
    toResponse(
      Effect.gen(function* () {
        const authorization = yield* authorize(apiKey, env);
        return yield* operation(authorization);
      })
    )
  );

export const handleCreateLink = (
  request: Request,
  env: Env
): Promise<Response> =>
  mutation(request, env, "LinksApi.createLink", (authorization) =>
    Effect.gen(function* () {
      const input = yield* jsonBody(request).pipe(
        Effect.flatMap((body) => decode(SaveLinkInput, body))
      );
      const result = yield* callRpc(authorization.orgId, "saveLink", () =>
        stub(env, authorization.orgId).saveLink({
          ...input,
          source: "api",
        } satisfies SaveLinkRpcInput)
      );
      trackEvent(env.USAGE_ANALYTICS, {
        userId: authorization.userId,
        event: "ingest",
        orgId: authorization.orgId,
      });
      return result;
    })
  );

export const handleUpdateLink = (
  request: Request,
  id: string,
  env: Env
): Promise<Response> =>
  mutation(request, env, "LinksApi.updateLink", (authorization) =>
    Effect.gen(function* () {
      const changes = yield* jsonBody(request).pipe(
        Effect.flatMap((body) => decode(LinkChanges, body))
      );
      return yield* callRpc(authorization.orgId, "updateLink", () =>
        stub(env, authorization.orgId).updateLink({ id, changes })
      );
    })
  );

export const handleUpdateLinks = (
  request: Request,
  env: Env
): Promise<Response> =>
  mutation(request, env, "LinksApi.updateLinks", (authorization) =>
    jsonBody(request).pipe(
      Effect.flatMap((body) => decode(UpdateLinksInput, body)),
      Effect.flatMap((input) =>
        callRpc(authorization.orgId, "updateLinks", () =>
          stub(env, authorization.orgId).updateLinks(input)
        )
      )
    )
  );
