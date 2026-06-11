import { Effect, Option } from "effect";

import { AuthClient } from "../auth/service";
import { capabilityDeniedResponse } from "../billing/errors";
import { requireCapability } from "../billing/service";
import type { Billing } from "../billing/service";
import { ApiKey } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import { runHandler } from "../runtime";
import type { Env } from "../shared";
import { decodeApiKeyMetadata } from "../sync/auth-payload";
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

export const listLinksEffect = (
  apiKey: ApiKey,
  params: ListParams,
  env: Env
): Effect.Effect<Response, never, AuthClient | Billing> =>
  Effect.gen(function* () {
    const auth = yield* AuthClient;

    const verify = yield* Effect.tryPromise(() =>
      auth.api.verifyApiKey({ body: { key: apiKey } })
    ).pipe(
      Effect.catchAll((cause) =>
        Effect.logError("Links API: verifyApiKey failed").pipe(
          Effect.annotateLogs(safeErrorInfo(cause)),
          Effect.as(null)
        )
      )
    );
    if (!verify) {
      return Response.json(
        { error: "Auth backend unavailable" },
        { status: 503 }
      );
    }
    if (!verify.valid || !verify.key) {
      return unauthorized();
    }

    const metadataOpt = decodeApiKeyMetadata(verify.key.metadata);
    if (Option.isNone(metadataOpt)) {
      yield* Effect.logWarning("Links API: API key metadata missing orgId");
      return unauthorized();
    }
    const { orgId } = metadataOpt.value;
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
      Effect.catchAll((cause) =>
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
