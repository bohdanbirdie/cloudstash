import { Effect } from "effect";

import { createAuth } from "../auth";
import { createDb } from "../db";
import { maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import { type Env } from "../shared";
import {
  InvalidApiKeyError,
  InvalidUrlError,
  MissingApiKeyError,
  MissingOrgIdError,
  MissingUrlError,
  type IngestError,
} from "./errors";

const logger = logSync("Ingest");

export const handleIngestRequest = (
  request: Request,
  env: Env
): Effect.Effect<
  { result: { linkId: string; status: string }; ok: boolean },
  IngestError | Error
> =>
  Effect.gen(function* () {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logger.warn("Missing API key");
      return yield* MissingApiKeyError.make({});
    }
    const apiKey = authHeader.slice(7);

    const db = createDb(env.DB);
    const auth = createAuth(env, db);

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

    const body = yield* Effect.tryPromise({
      catch: () => MissingUrlError.make({}),
      try: () => request.json() as Promise<{ url?: string }>,
    });

    if (!body.url) {
      logger.warn("Missing URL in request body");
      return yield* MissingUrlError.make({});
    }

    try {
      new URL(body.url);
    } catch {
      logger.warn("Invalid URL format");
      return yield* InvalidUrlError.make({ url: body.url });
    }

    const storeId = orgId;
    const doId = env.LINK_PROCESSOR_DO.idFromName(storeId);
    const stub = env.LINK_PROCESSOR_DO.get(doId);

    const doUrl = new URL("https://do/");
    doUrl.searchParams.set("storeId", storeId);
    doUrl.searchParams.set("ingest", body.url);

    const response = yield* Effect.tryPromise({
      catch: (error) => new Error(`DO fetch failed: ${error}`),
      try: () => stub.fetch(doUrl.toString()),
    });

    const result = yield* Effect.tryPromise({
      catch: () => new Error("Failed to parse DO response"),
      try: () => response.json() as Promise<{ linkId: string; status: string }>,
    });

    logger.info("Ingest complete", {
      linkId: result.linkId,
      status: result.status,
    });

    return { ok: response.ok, result };
  });

export const ingestRequestToResponse = (
  request: Request,
  env: Env
): Effect.Effect<Response, never, never> =>
  handleIngestRequest(request, env).pipe(
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
        Response.json(
          { error: error instanceof Error ? error.message : "Unknown error" },
          { status: 500 }
        )
      );
    })
  );
