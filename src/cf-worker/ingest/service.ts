import { Effect } from "effect";

import { trackEvent } from "../analytics";
import { AppLayerLive } from "../auth/service";
import { WorkspaceAccess } from "../auth/workspace-access";
import { capabilityDeniedResponse } from "../billing/errors";
import { requireCapability } from "../billing/service";
import { ApiKey } from "../db/branded";
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

export const handleIngestRequest = Effect.fn("Ingest.handleIngestRequest")(
  function* (request: Request, env: Env) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      yield* Effect.logWarning("Missing API key");
      return yield* IngestMissingApiKeyError.make({});
    }
    const apiKey = ApiKey.make(authHeader.slice(7));
    const workspaceAccess = yield* WorkspaceAccess;
    const { orgId, userId } = yield* workspaceAccess
      .authorize({ _tag: "ApiKey", apiKey })
      .pipe(
        Effect.catchTags({
          WorkspaceCredentialInvalidError: () =>
            Effect.fail(IngestInvalidApiKeyError.make({})),
          WorkspaceScopeMissingError: () =>
            Effect.fail(IngestMissingOrgIdError.make({})),
          WorkspaceApiKeyReferenceMissingError: () =>
            Effect.fail(IngestInvalidApiKeyError.make({})),
          WorkspaceScopeMismatchError: () =>
            Effect.fail(IngestAccessDeniedError.make({})),
          WorkspaceUserUnapprovedError: () =>
            Effect.fail(IngestAccessDeniedError.make({})),
          WorkspaceMembershipRevokedError: () =>
            Effect.fail(IngestAccessDeniedError.make({})),
          WorkspaceAccessBackendError: (error) =>
            Effect.fail(IngestAuthBackendError.make({ cause: error.cause })),
        })
      );

    yield* Effect.logDebug("API key verified").pipe(
      Effect.annotateLogs({ orgId: maskId(orgId) })
    );

    yield* requireCapability(orgId, "publicApi");

    trackEvent(env.USAGE_ANALYTICS, {
      userId,
      event: "ingest",
      orgId,
    });

    const body = yield* Effect.tryPromise({
      catch: () => IngestMissingUrlError.make({}),
      try: (): Promise<{ url?: string }> => request.json(),
    });

    if (!body.url) {
      yield* Effect.logWarning("Missing URL in request body");
      return yield* IngestMissingUrlError.make({});
    }

    const url = body.url;

    yield* Effect.try(() => new URL(url)).pipe(
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
