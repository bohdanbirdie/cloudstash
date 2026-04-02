import { Effect } from "effect";

import { trackEvent } from "../analytics";
import { AppLayerLive, AuthClient } from "../auth/service";
import type { LinkQueueMessage } from "../link-processor/types";
import { maskId, safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import {
  InvalidApiKeyError,
  InvalidUrlError,
  MissingApiKeyError,
  MissingOrgIdError,
  MissingUrlError,
  QueueSendError,
} from "./errors";

export const handleIngestRequest = Effect.fn("Ingest.handleIngestRequest")(
  function* (request: Request, env: Env) {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      yield* Effect.logWarning("Missing API key");
      return yield* MissingApiKeyError.make({});
    }
    const apiKey = authHeader.slice(7);

    const auth = yield* AuthClient;

    const verifyResult = yield* Effect.tryPromise({
      catch: () => InvalidApiKeyError.make({}),
      try: () => auth.api.verifyApiKey({ body: { key: apiKey } }),
    });

    if (!verifyResult.valid || !verifyResult.key) {
      yield* Effect.logWarning("Invalid API key");
      return yield* InvalidApiKeyError.make({});
    }

    const orgId = verifyResult.key.metadata?.orgId as string | undefined;
    if (!orgId) {
      yield* Effect.logWarning("API key missing orgId");
      return yield* MissingOrgIdError.make({});
    }

    yield* Effect.logDebug("API key verified").pipe(Effect.annotateLogs({ orgId: maskId(orgId) }));

    trackEvent(env.USAGE_ANALYTICS, {
      userId: verifyResult.key.referenceId ?? "api",
      event: "ingest",
      orgId,
    });

    const body = yield* Effect.tryPromise({
      catch: () => MissingUrlError.make({}),
      try: (): Promise<{ url?: string }> => request.json(),
    });

    if (!body.url) {
      yield* Effect.logWarning("Missing URL in request body");
      return yield* MissingUrlError.make({});
    }

    const url = body.url;

    yield* Effect.try(() => new URL(url)).pipe(
      Effect.mapError(() => new InvalidUrlError({ url }))
    );

    yield* Effect.tryPromise({
      catch: (cause) => new QueueSendError({ cause }),
      try: () =>
        env.LINK_QUEUE.send({
          source: "api",
          sourceMeta: null,
          storeId: orgId,
          url,
        } satisfies LinkQueueMessage),
    });

    yield* Effect.logInfo("Ingest queued").pipe(Effect.annotateLogs({ url, orgId: maskId(orgId) }));

    return { ok: true, result: { status: "queued" } };
  }
);

export const ingestRequestToResponse = (
  request: Request,
  env: Env
): Effect.Effect<Response> =>
  handleIngestRequest(request, env).pipe(
    Effect.provide(AppLayerLive(env)),
    Effect.map(({ result, ok }) =>
      Response.json(result, { status: ok ? 200 : 400 })
    ),
    Effect.catchTags({
      InvalidApiKeyError: () =>
        Effect.succeed(
          Response.json({ error: "Invalid API key" }, { status: 401 })
        ),
      InvalidUrlError: () =>
        Effect.succeed(
          Response.json({ error: "Invalid URL" }, { status: 400 })
        ),
      MissingApiKeyError: () =>
        Effect.succeed(
          Response.json({ error: "Missing API key" }, { status: 401 })
        ),
      MissingOrgIdError: () =>
        Effect.succeed(
          Response.json(
            { error: "API key missing orgId metadata" },
            { status: 401 }
          )
        ),
      MissingUrlError: () =>
        Effect.succeed(
          Response.json({ error: "Missing url" }, { status: 400 })
        ),
    }),
    Effect.catchAll((error) =>
      Effect.logError("Ingest failed").pipe(
        Effect.annotateLogs(safeErrorInfo(error)),
        Effect.as(Response.json({ error: "Queue send failed" }, { status: 500 }))
      )
    )
  );
