import { Effect, Schema } from "effect";

import { HttpUrlFromString } from "@/lib/http-url";

import { trackEvent } from "../analytics";
import { bearerApiKey } from "../auth/bearer-api-key";
import { AppLayerLive } from "../auth/service";
import {
  WorkspaceAccess,
  matchWorkspaceAccessError,
} from "../auth/workspace-access";
import { capabilityDeniedResponse } from "../billing/errors";
import { requireCapability } from "../billing/service";
import type { OrgId, UserId } from "../db/branded";
import type { LinkQueueMessage } from "../link-processor/types";
import { maskId, safeErrorInfo } from "../log-utils";
import { provideResponse } from "../runtime";
import type { Env } from "../shared";
import {
  IngestInvalidApiKeyError,
  IngestAccessDeniedError,
  IngestAuthBackendError,
  IngestInvalidUrlError,
  IngestMissingApiKeyError,
  IngestMissingOrgIdError,
  IngestMissingUrlError,
  IngestQueueSendError,
} from "./errors";

const IngestBody = Schema.Struct({ url: Schema.String });
const decodeIngestBody = Schema.decodeUnknownEffect(IngestBody);
const decodeUrl = Schema.decodeUnknownEffect(HttpUrlFromString);

export const enqueueLink = Effect.fn("Ingest.enqueueLink")(function* (
  authorization: { readonly orgId: OrgId; readonly userId: UserId },
  url: string,
  source: string,
  env: Env,
  options: { readonly trackUsage?: boolean } = {}
) {
  yield* decodeUrl(url).pipe(
    Effect.mapError(() => new IngestInvalidUrlError({ url }))
  );
  yield* Effect.annotateCurrentSpan("orgId", maskId(authorization.orgId));
  yield* Effect.annotateCurrentSpan("source", source);

  if (options.trackUsage !== false) {
    trackEvent(env.USAGE_ANALYTICS, {
      userId: authorization.userId,
      event: "ingest",
      orgId: authorization.orgId,
    });
  }

  yield* Effect.tryPromise({
    catch: (cause) => new IngestQueueSendError({ cause }),
    try: () =>
      env.LINK_QUEUE.send({
        source,
        sourceMeta: null,
        storeId: authorization.orgId,
        url,
      } satisfies LinkQueueMessage),
  });

  yield* Effect.logInfo("Ingest queued").pipe(
    Effect.annotateLogs({
      orgId: maskId(authorization.orgId),
      source,
    })
  );
});

const translateWorkspaceAccess = (
  error: Parameters<typeof matchWorkspaceAccessError>[0]
):
  | IngestInvalidApiKeyError
  | IngestMissingOrgIdError
  | IngestAccessDeniedError
  | IngestAuthBackendError =>
  matchWorkspaceAccessError<
    | IngestInvalidApiKeyError
    | IngestMissingOrgIdError
    | IngestAccessDeniedError
    | IngestAuthBackendError
  >(error, {
    unauthorized: () => IngestInvalidApiKeyError.make({}),
    missingScope: () => IngestMissingOrgIdError.make({}),
    forbidden: () => IngestAccessDeniedError.make({}),
    backend: ({ cause }) => IngestAuthBackendError.make({ cause }),
  });

export const handleIngestRequest = Effect.fnUntraced(function* (
  request: Request,
  env: Env
) {
  const apiKey = yield* Effect.fromOption(bearerApiKey(request.headers), () =>
    IngestMissingApiKeyError.make({})
  );
  const workspaceAccess = yield* WorkspaceAccess;
  const { orgId, userId } = yield* workspaceAccess
    .authorizeApiKey(apiKey)
    .pipe(Effect.mapError(translateWorkspaceAccess));

  yield* Effect.logDebug("API key verified").pipe(
    Effect.annotateLogs({ orgId: maskId(orgId) })
  );

  yield* requireCapability(orgId, "publicApi");

  // Preserve the public API's established attempt-level analytics timing,
  // including malformed request bodies and invalid URLs.
  trackEvent(env.USAGE_ANALYTICS, {
    userId,
    event: "ingest",
    orgId,
  });

  const { url } = yield* Effect.tryPromise(() => request.json<unknown>()).pipe(
    Effect.flatMap(decodeIngestBody),
    Effect.mapError(() => IngestMissingUrlError.make({}))
  );
  yield* enqueueLink({ orgId, userId }, url, "api", env, {
    trackUsage: false,
  });

  return { ok: true, result: { status: "queued" } };
});

export const ingestResponse = <Requirements>(
  effect: Effect.Effect<
    Effect.Success<ReturnType<typeof handleIngestRequest>>,
    Effect.Error<ReturnType<typeof handleIngestRequest>>,
    Requirements
  >
): Effect.Effect<Response, never, Requirements> =>
  effect.pipe(
    Effect.map(({ result, ok }) =>
      Response.json(result, { status: ok ? 200 : 400 })
    ),
    Effect.catchTags({
      CapabilityDisabledError: (error) =>
        Effect.succeed(capabilityDeniedResponse(error)),
      IngestInvalidApiKeyError: () =>
        Effect.succeed(
          Response.json({ error: "Invalid API key" }, { status: 401 })
        ),
      IngestAccessDeniedError: () =>
        Effect.succeed(Response.json({ error: "Forbidden" }, { status: 403 })),
      IngestInvalidUrlError: () =>
        Effect.succeed(
          Response.json({ error: "Invalid URL" }, { status: 400 })
        ),
      IngestMissingApiKeyError: () =>
        Effect.succeed(
          Response.json({ error: "Missing API key" }, { status: 401 })
        ),
      IngestMissingOrgIdError: () =>
        Effect.succeed(
          Response.json(
            { error: "API key missing orgId metadata" },
            { status: 401 }
          )
        ),
      IngestMissingUrlError: () =>
        Effect.succeed(
          Response.json({ error: "Missing url" }, { status: 400 })
        ),
      OrgNotFoundError: (error) =>
        Effect.logWarning("Ingest: org not found").pipe(
          Effect.annotateLogs({ orgId: maskId(error.orgId) }),
          Effect.as(
            Response.json({ error: "Organization not found" }, { status: 404 })
          )
        ),
    }),
    Effect.withSpan("Ingest.handleIngestRequest"),
    Effect.catchTags({
      DbError: (cause) =>
        Effect.logError("Ingest: capability check failed").pipe(
          Effect.annotateLogs(safeErrorInfo(cause)),
          Effect.as(Response.json({ error: "Internal error" }, { status: 500 }))
        ),
      IngestAuthBackendError: (error) =>
        Effect.logError("Ingest: auth backend unavailable").pipe(
          Effect.annotateLogs(safeErrorInfo(error.cause)),
          Effect.as(
            Response.json(
              { error: "Auth backend unavailable" },
              { status: 503 }
            )
          )
        ),
      IngestQueueSendError: (error) =>
        Effect.logError("Ingest failed").pipe(
          Effect.annotateLogs(safeErrorInfo(error)),
          Effect.as(
            Response.json({ error: "Queue send failed" }, { status: 500 })
          )
        ),
    })
  );

export const ingestRequestToResponse = (
  request: Request,
  env: Env
): Effect.Effect<Response> =>
  provideResponse(
    ingestResponse(handleIngestRequest(request, env)),
    AppLayerLive(env),
    (cause) =>
      Effect.logError("Ingest handler crashed").pipe(
        Effect.annotateLogs(safeErrorInfo(cause)),
        Effect.as(Response.json({ error: "Internal error" }, { status: 500 }))
      )
  );
