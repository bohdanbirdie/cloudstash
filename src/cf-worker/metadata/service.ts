/// <reference types="@cloudflare/workers-types" />
import { Data, Effect, Match, Schema } from "effect";

import { WorkspaceAccess } from "../auth/workspace-access";
import { workspaceAccessHttpResponse } from "../auth/workspace-access-http";
import { safeErrorInfo } from "../log-utils";
import {
  BoundedFetchFailure,
  fetchBoundedText,
  HttpTargetUrl,
} from "../net/bounded-fetch";
import { annotateWideEvent } from "../observability/wide-event";
import {
  MetadataFetchError,
  MetadataInvalidTargetError,
  MetadataMissingUrlError,
  MetadataParseError,
  MetadataRateLimitBackendError,
  MetadataRateLimitedError,
  MetadataError,
} from "./errors";
import { tryExtract } from "./extractors";
import { METADATA_FETCH_HEADERS, parseMetadataHtml } from "./parser";
import { OgMetadata } from "./schema";

export const PREVIEW_FETCH_POLICY = {
  maxBytes: 2_000_000,
  maxRedirects: 5,
  timeoutMs: 8_000,
} as const;

export const PROCESSING_FETCH_POLICY = {
  maxBytes: 5_000_000,
  maxRedirects: 5,
  timeoutMs: 9_000,
} as const;

const RATE_LIMIT_RETRY_SECONDS = 60;
const RateLimitOutcome = Schema.Struct({ success: Schema.Boolean });
const decodeOgMetadata = Schema.decodeUnknownEffect(OgMetadata);

class MetadataServerResponseError extends Data.TaggedError(
  "MetadataServerResponseError"
)<{ readonly response: Response }> {}

const toMetadataFetchError = (cause: unknown) =>
  cause instanceof BoundedFetchFailure
    ? new MetadataFetchError({
        errorType:
          cause.cause === undefined
            ? undefined
            : safeErrorInfo(cause.cause).errorType,
        reason: cause.reason,
        statusCode: cause.statusCode,
      })
    : new MetadataFetchError({
        errorType: safeErrorInfo(cause).errorType,
        reason: "unknown",
      });

export const fetchOgMetadata = Effect.fnUntraced(function* (
  target: unknown,
  options: {
    readonly fetcher?: typeof fetch;
    readonly ownHostname?: string;
    readonly signal?: AbortSignal;
    readonly policy?: {
      readonly maxBytes: number;
      readonly maxRedirects: number;
      readonly timeoutMs: number;
    };
  } = {}
) {
  const policy = options.policy ?? PROCESSING_FETCH_POLICY;
  const fetcher = options.fetcher ?? fetch;
  const targetSchema = HttpTargetUrl(options.ownHostname);
  const targetUrl = yield* Schema.decodeUnknownEffect(targetSchema)(
    target
  ).pipe(Effect.mapError(() => new MetadataInvalidTargetError()));
  const signal = options.signal ?? AbortSignal.timeout(policy.timeoutMs);

  const extracted = yield* tryExtract(targetUrl, {
    fetcher,
    maxBytes: policy.maxBytes,
    maxRedirects: policy.maxRedirects,
    signal,
    targetSchema,
  });

  if (extracted) {
    yield* annotateWideEvent({
      metadata: {
        extractor: extracted.extractor,
        extractorAuthoritative: extracted.authoritative,
      },
    });
    yield* Effect.annotateCurrentSpan({
      extractor: extracted.extractor,
      extractorAuthoritative: extracted.authoritative,
    });
    yield* Effect.logInfo("Per-host extractor matched").pipe(
      Effect.annotateLogs({
        authoritative: extracted.authoritative,
        extractor: extracted.extractor,
      })
    );
    if (extracted.authoritative) {
      return yield* decodeOgMetadata(extracted.result).pipe(
        Effect.mapError(
          (cause) =>
            new MetadataParseError({
              errorType: safeErrorInfo(cause).errorType,
            })
        )
      );
    }
  }

  const page = yield* Effect.tryPromise({
    catch: toMetadataFetchError,
    try: () =>
      fetchBoundedText({
        acceptedContentTypes: ["text/html", "application/xhtml+xml"],
        fetcher,
        headers: METADATA_FETCH_HEADERS,
        maxBytes: policy.maxBytes,
        maxRedirects: policy.maxRedirects,
        signal,
        targetSchema,
        url: targetUrl,
      }),
  });

  const result = yield* Effect.tryPromise({
    catch: (cause) =>
      new MetadataParseError({ errorType: safeErrorInfo(cause).errorType }),
    try: () => parseMetadataHtml(page.body, page.finalUrl),
  });
  const ext = extracted?.result;
  return yield* decodeOgMetadata({
    description: ext?.description ?? result.description,
    favicon:
      ext?.favicon ??
      result.favicon ??
      URL.parse("/favicon.ico", page.finalUrl)?.href,
    image: ext?.image ?? result.image,
    title: ext?.title ?? result.title,
  }).pipe(
    Effect.mapError(
      (cause) =>
        new MetadataParseError({
          errorType: safeErrorInfo(cause).errorType,
        })
    )
  );
});

const handleMetadataRequest = Effect.fnUntraced(function* (
  request: Request,
  rateLimiter: RateLimit,
  applicationHostname: string,
  fetcher: typeof fetch = fetch
) {
  const workspaceAccess = yield* WorkspaceAccess;
  const authorization = yield* workspaceAccess.authorizeSession(
    request.headers
  );
  yield* annotateWideEvent({
    auth: { method: "session", outcome: "success" },
  });

  const rateLimitResult = yield* Effect.tryPromise({
    try: () => rateLimiter.limit({ key: authorization.userId }),
    catch: (cause) => new MetadataRateLimitBackendError({ cause }),
  });
  const rateLimit = yield* Schema.decodeUnknownEffect(RateLimitOutcome)(
    rateLimitResult
  ).pipe(
    Effect.mapError((cause) => new MetadataRateLimitBackendError({ cause }))
  );
  if (!rateLimit.success) {
    yield* annotateWideEvent({
      rateLimit: { scope: "metadata", outcome: "limited" },
    });
    return yield* new MetadataRateLimitedError({
      retryAfterSeconds: RATE_LIMIT_RETRY_SECONDS,
    });
  }
  yield* annotateWideEvent({
    rateLimit: { scope: "metadata", outcome: "passed" },
  });

  const requestUrl = new URL(request.url);
  const target = requestUrl.searchParams.get("url");
  if (target === null) {
    yield* annotateWideEvent({ metadata: { outcome: "missing_url" } });
    return yield* new MetadataMissingUrlError();
  }

  const metadata = yield* fetchOgMetadata(target, {
    fetcher,
    ownHostname: applicationHostname,
    policy: PREVIEW_FETCH_POLICY,
  });
  yield* Effect.logInfo("Metadata preview fetched").pipe(
    Effect.annotateLogs({
      hasDescription: metadata.description !== undefined,
      hasImage: metadata.image !== undefined,
      hasTitle: metadata.title !== undefined,
    })
  );
  yield* annotateWideEvent({
    metadata: {
      outcome: "success",
      hasDescription: metadata.description !== undefined,
      hasImage: metadata.image !== undefined,
      hasTitle: metadata.title !== undefined,
    },
  });
  return metadata;
});

export const metadataErrorToResponse = Effect.fnUntraced(function* (
  error: MetadataError
) {
  yield* annotateWideEvent({ metadata: { outcome: error._tag } });
  return yield* Match.typeTags<MetadataError, Effect.Effect<Response>>()({
    MetadataFetchError: (failure) =>
      Effect.logWarning("Metadata preview fetch failed").pipe(
        Effect.annotateLogs({
          reason: failure.reason,
          statusCode: failure.statusCode,
          errorType: failure.errorType,
        }),
        Effect.as(
          Response.json(
            { error: "Metadata preview unavailable" },
            { status: failure.reason === "timeout" ? 504 : 502 }
          )
        )
      ),
    MetadataInvalidTargetError: () =>
      Effect.succeed(
        Response.json({ error: "Invalid metadata target" }, { status: 400 })
      ),
    MetadataMissingUrlError: ({ message }) =>
      Effect.succeed(Response.json({ error: message }, { status: 400 })),
    MetadataParseError: ({ errorType }) =>
      Effect.logWarning("Metadata preview parse failed").pipe(
        Effect.annotateLogs({ errorType }),
        Effect.as(
          Response.json(
            { error: "Metadata preview unavailable" },
            { status: 502 }
          )
        )
      ),
    MetadataRateLimitBackendError: ({ cause }) =>
      Effect.logError("Metadata preview rate limiter unavailable").pipe(
        Effect.annotateLogs(safeErrorInfo(cause)),
        Effect.as(
          Response.json(
            { error: "Metadata preview unavailable" },
            { status: 503 }
          )
        )
      ),
    MetadataRateLimitedError: ({ retryAfterSeconds }) =>
      Effect.succeed(
        Response.json(
          {
            error: "Metadata preview temporarily limited",
            retryAfterSeconds,
          },
          {
            headers: { "Retry-After": String(retryAfterSeconds) },
            status: 429,
          }
        )
      ),
  })(error);
});

const isMetadataError = Schema.is(MetadataError);

const preventMetadataResponseCaching = (response: Response): Response => {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
};

export const metadataRequestToResponse = (
  request: Request,
  rateLimiter: RateLimit,
  applicationHostname: string,
  fetcher: typeof fetch = fetch
) =>
  handleMetadataRequest(
    request,
    rateLimiter,
    applicationHostname,
    fetcher
  ).pipe(
    Effect.map((metadata) =>
      Response.json(metadata, {
        headers: { "Cache-Control": "private, no-store" },
      })
    ),
    Effect.catchIf(isMetadataError, metadataErrorToResponse),
    Effect.catch(workspaceAccessHttpResponse),
    Effect.flatMap((response) =>
      response.status >= 500
        ? Effect.fail(new MetadataServerResponseError({ response }))
        : Effect.succeed(response)
    ),
    Effect.withSpan("API.metadataPreview"),
    Effect.catchTag("MetadataServerResponseError", ({ response }) =>
      Effect.succeed(response)
    ),
    Effect.map(preventMetadataResponseCaching)
  );
