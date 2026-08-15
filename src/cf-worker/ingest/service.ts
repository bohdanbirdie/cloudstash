import { Effect, Schema } from "effect";

import { trackEvent } from "../analytics";
import { bearerApiKey } from "../auth/bearer-api-key";
import { AppLayerLive } from "../auth/service";
import {
  WorkspaceAccess,
  matchWorkspaceAccessError,
} from "../auth/workspace-access";
import { capabilityDeniedResponse } from "../billing/errors";
import { requireCapability } from "../billing/service";
import type { LinkQueueMessage } from "../link-processor/types";
import { maskId, safeErrorInfo } from "../log-utils";
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
const decodeUrl = Schema.decodeUnknownEffect(Schema.URLFromString);

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

export const handleIngestRequest = Effect.fn("Ingest.handleIngestRequest")(
  function* (request: Request, env: Env) {
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

    trackEvent(env.USAGE_ANALYTICS, {
      userId,
      event: "ingest",
      orgId,
    });

    const { url } = yield* Effect.tryPromise(() =>
      request.json<unknown>()
    ).pipe(
      Effect.flatMap(decodeIngestBody),
      Effect.mapError(() => IngestMissingUrlError.make({}))
    );
    yield* decodeUrl(url).pipe(
      Effect.mapError(() => new IngestInvalidUrlError({ url }))
    );

    yield* Effect.tryPromise({
      catch: (cause) => new IngestQueueSendError({ cause }),
      try: () =>
        env.LINK_QUEUE.send({
          source: "api",
          sourceMeta: null,
          storeId: orgId,
          url,
        } satisfies LinkQueueMessage),
    });

    yield* Effect.logInfo("Ingest queued").pipe(
      Effect.annotateLogs({ url, orgId: maskId(orgId) })
    );

    return { ok: true, result: { status: "queued" } };
  }
);

export const ingestResponse = (
  effect: Effect.Effect<
    Effect.Success<ReturnType<typeof handleIngestRequest>>,
    Effect.Error<ReturnType<typeof handleIngestRequest>>
  >
): Effect.Effect<Response> =>
  effect.pipe(
    Effect.map(({ result, ok }) =>
      Response.json(result, { status: ok ? 200 : 400 })
    ),
    Effect.catchTags({
      CapabilityDisabledError: (error) =>
        Effect.succeed(capabilityDeniedResponse(error)),
      DbError: (cause) =>
        Effect.logError("Ingest: capability check failed").pipe(
          Effect.annotateLogs(safeErrorInfo(cause)),
          Effect.as(Response.json({ error: "Internal error" }, { status: 500 }))
        ),
      IngestInvalidApiKeyError: () =>
        Effect.succeed(
          Response.json({ error: "Invalid API key" }, { status: 401 })
        ),
      IngestAccessDeniedError: () =>
        Effect.succeed(Response.json({ error: "Forbidden" }, { status: 403 })),
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
    Effect.catchTag("IngestQueueSendError", (error) =>
      Effect.logError("Ingest failed").pipe(
        Effect.annotateLogs(safeErrorInfo(error)),
        Effect.as(
          Response.json({ error: "Queue send failed" }, { status: 500 })
        )
      )
    )
  );

export const ingestRequestToResponse = (
  request: Request,
  env: Env
): Effect.Effect<Response> =>
  ingestResponse(
    handleIngestRequest(request, env).pipe(Effect.provide(AppLayerLive(env)))
  );
