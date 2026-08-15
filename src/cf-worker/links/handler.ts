import { Effect, Match } from "effect";

import { WorkspaceAccess } from "../auth/workspace-access";
import type { WorkspaceAccessError } from "../auth/workspace-access";
import { capabilityDeniedResponse } from "../billing/errors";
import { requireCapability } from "../billing/service";
import type { Billing } from "../billing/service";
import { ApiKey } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import { runHandler } from "../runtime";
import type { Env } from "../shared";
import { parseListParams } from "./api";
import type { ParsedListParams } from "./api";

type ListParams = Extract<ParsedListParams, { ok: true }>;

const bearerToken = (headers: Headers): ApiKey | null => {
  const authz = headers.get("authorization");
  if (!authz) return null;
  const [scheme, token] = authz.split(" ");
  return scheme?.toLowerCase() === "bearer" && token
    ? ApiKey.make(token)
    : null;
};

const unauthorized = (): Response =>
  Response.json({ error: "Unauthorized" }, { status: 401 });

const workspaceAccessResponse = (error: WorkspaceAccessError): Response =>
  Match.value(error).pipe(
    Match.tagsExhaustive({
      WorkspaceCredentialInvalidError: unauthorized,
      WorkspaceScopeMissingError: unauthorized,
      WorkspaceApiKeyReferenceMissingError: unauthorized,
      WorkspaceScopeMismatchError: () =>
        Response.json({ error: "Forbidden" }, { status: 403 }),
      WorkspaceUserUnapprovedError: () =>
        Response.json({ error: "Forbidden" }, { status: 403 }),
      WorkspaceMembershipRevokedError: () =>
        Response.json({ error: "Forbidden" }, { status: 403 }),
      WorkspaceAccessBackendError: () =>
        Response.json({ error: "Auth backend unavailable" }, { status: 503 }),
    })
  );

export const listLinksEffect = (
  apiKey: ApiKey,
  params: ListParams,
  env: Env
): Effect.Effect<Response, never, WorkspaceAccess | Billing> =>
  Effect.gen(function* () {
    const workspaceAccess = yield* WorkspaceAccess;
    const authorization = yield* workspaceAccess
      .authorize({ _tag: "ApiKey", apiKey })
      .pipe(
        Effect.match({
          onFailure: workspaceAccessResponse,
          onSuccess: (access) => access,
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
              Response.json(
                { error: "Organization not found" },
                { status: 404 }
              )
            )
          ),
        DbError: (cause) =>
          Effect.logError("Links API: capability check failed").pipe(
            Effect.annotateLogs({
              orgId: maskId(orgId),
              ...safeErrorInfo(cause),
            }),
            Effect.as(
              Response.json({ error: "Internal error" }, { status: 500 })
            )
          ),
      })
    );
    if (denied) return denied;

    const page = yield* Effect.tryPromise(() =>
      env.Chat.get(env.Chat.idFromName(orgId)).listLinks({
        state: params.state,
        limit: params.limit,
        cursor: params.cursor,
      })
    ).pipe(
      Effect.catch((cause) =>
        Effect.logError("Links API: listLinks RPC failed").pipe(
          Effect.annotateLogs({
            orgId: maskId(orgId),
            ...safeErrorInfo(cause),
          }),
          Effect.as(null)
        )
      )
    );
    if (!page) {
      return Response.json({ error: "Internal error" }, { status: 500 });
    }

    return Response.json(page);
  }).pipe(Effect.withSpan("LinksApi.listLinks"));

export const handleListLinks = (
  request: Request,
  env: Env
): Promise<Response> => {
  const apiKey = bearerToken(request.headers);
  if (!apiKey) return Promise.resolve(unauthorized());

  const params = parseListParams(new URL(request.url));
  if (!params.ok) {
    return Promise.resolve(
      Response.json({ error: params.error }, { status: 400 })
    );
  }

  return runHandler(env, listLinksEffect(apiKey, params, env));
};
