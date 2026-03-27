import { Effect } from "effect";

import { trackEvent } from "../analytics";
import { AppLayerLive, AuthClient } from "../auth/service";
import type { LinkQueueMessage } from "../link-processor/types";
import { maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import type { Env } from "../shared";
import {
  InvalidApiKeyError,
  InvalidUrlError,
  MissingApiKeyError,
  MissingOrgIdError,
  MissingUrlError,
  QueueSendError,
} from "./errors";
import type { IngestError } from "./errors";

const logger = logSync("Ingest");

export const handleIngestRequest = (
  request: Request,
  env: Env
): Effect.Effect<
  { result: { status: string }; ok: boolean },
  IngestError,
  AuthClient
> =>
  Effect.gen(function* () {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logger.warn("Missing API key");
      return yield* MissingApiKeyError.make({});
    }
    const apiKey = authHeader.slice(7);

    const auth = yield* AuthClient;

    const verifyResult = yield* Effect.tryPromise({
      catch: () => InvalidApiKeyError.make({}),
      try: () => auth.api.verifyApiKey({ body: { key: apiKey } }),
    });

    if (!verifyResult.valid || !verifyResult.key) {
      logger.warn("Invalid API key");
      return yield* InvalidApiKeyError.make({});
    }

    const orgId = verifyResult.key.metadata?.orgId as string | undefined;
    if (!orgId) {
      logger.warn("API key missing orgId");
      return yield* MissingOrgIdError.make({});
    }

    logger.debug("API key verified", { orgId: maskId(orgId) });

    trackEvent(env.USAGE_ANALYTICS, {
      userId: verifyResult.key.referenceId ?? "api",
      event: "ingest",
      orgId,
    });

    const body = yield* Effect.tryPromise({
      catch: () => MissingUrlError.make({}),
      try: () => request.json() as Promise<{ url?: string }>,
    });

    if (!body.url) {
      logger.warn("Missing URL in request body");
      return yield* MissingUrlError.make({});
    }

    const url = body.url;

    yield* Effect.try(() => new URL(url)).pipe(
      Effect.mapError(() => {
        logger.warn("Invalid URL format");
        return new InvalidUrlError({ url });
      })
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

    logger.info("Ingest queued", { url, orgId: maskId(orgId) });

    return { ok: true, result: { status: "queued" } };
  });

export const ingestRequestToResponse = (
  request: Request,
  env: Env
): Effect.Effect<Response, never, never> =>
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
    Effect.catchAll((error) => {
      logger.error("Ingest failed", safeErrorInfo(error));
      return Effect.succeed(
        Response.json({ error: "Queue send failed" }, { status: 500 })
      );
    })
  );
