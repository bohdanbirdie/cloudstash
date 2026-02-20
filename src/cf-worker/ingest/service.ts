import { Effect } from "effect";

import { trackEvent } from "../analytics";
import { createAuth } from "../auth";
import { createDb } from "../db";
import { maskId, safeErrorInfo } from "../log-utils";
import { type Env } from "../shared";
import {
  InvalidApiKeyError,
  InvalidUrlError,
  MissingApiKeyError,
  MissingOrgIdError,
  MissingUrlError,
  type IngestError,
} from "./errors";

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
      yield* Effect.logWarning("Missing API key").pipe(
        Effect.annotateLogs({ ingestError: "missing_api_key" })
      );
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
      yield* Effect.logWarning("Invalid API key").pipe(
        Effect.annotateLogs({ ingestError: "invalid_api_key" })
      );
      return yield* InvalidApiKeyError.make({});
    }

    const orgId = verifyResult.key.metadata?.orgId as string | undefined;
    if (!orgId) {
      yield* Effect.logWarning("API key missing orgId").pipe(
        Effect.annotateLogs({ ingestError: "missing_org_id" })
      );
      return yield* MissingOrgIdError.make({});
    }

    yield* Effect.annotateLogs({ orgId: maskId(orgId) })(Effect.void);

    trackEvent(env.USAGE_ANALYTICS, {
      userId: verifyResult.key.userId ?? "api",
      event: "ingest",
      orgId,
    });

    const body = yield* Effect.tryPromise({
      catch: () => MissingUrlError.make({}),
      try: () => request.json() as Promise<{ url?: string }>,
    });

    if (!body.url) {
      yield* Effect.logWarning("Missing URL in request body").pipe(
        Effect.annotateLogs({ ingestError: "missing_url" })
      );
      return yield* MissingUrlError.make({});
    }

    try {
      new URL(body.url);
    } catch {
      yield* Effect.logWarning("Invalid URL format").pipe(
        Effect.annotateLogs({ ingestError: "invalid_url" })
      );
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

    yield* Effect.logInfo("Ingest complete").pipe(
      Effect.annotateLogs({
        linkId: result.linkId,
        ingestStatus: result.status,
      })
    );

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
    Effect.catchAll((error) =>
      Effect.logError("Ingest failed").pipe(
        Effect.annotateLogs(safeErrorInfo(error)),
        Effect.as(
          Response.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
          )
        )
      )
    )
  );
