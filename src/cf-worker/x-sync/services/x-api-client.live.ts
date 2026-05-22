import { Effect, Layer, Schema } from "effect";

import { XTweetId, XUserId, XUsername } from "../../db/branded";
import {
  XApiError,
  XPaymentRequiredError,
  XRateLimitedError,
  XUnauthorizedError,
} from "../errors";
import type { GetBookmarksParams } from "../services";
import { XApiClient } from "../services";

const X_API_BASE = "https://api.twitter.com/2";

const MeResponse = Schema.Struct({
  data: Schema.Struct({
    id: XUserId,
    username: XUsername,
    name: Schema.String,
    profile_image_url: Schema.optional(Schema.String),
  }),
});

const BookmarksResponse = Schema.Struct({
  data: Schema.optional(
    Schema.Array(
      Schema.Struct({
        id: XTweetId,
        text: Schema.String,
        author_id: XUserId,
        created_at: Schema.optional(Schema.String),
      })
    )
  ),
  meta: Schema.optional(
    Schema.Struct({
      next_token: Schema.optional(Schema.String),
    })
  ),
});

const parseRetryAfterMs = (header: string | null): number => {
  if (!header) return 60_000;
  const seconds = Number.parseInt(header, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return 60_000;
  return seconds * 1000;
};

const getMeImpl = Effect.fn("XApiClient.getMe")(function* (
  accessToken: string
) {
  const endpoint = "users/me";
  yield* Effect.annotateCurrentSpan("endpoint", endpoint);

  const resp = yield* Effect.tryPromise({
    try: () =>
      fetch(
        `${X_API_BASE}/users/me?user.fields=username,name,profile_image_url`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      ),
    catch: (cause) =>
      new XApiError({ endpoint, status: 0, message: "fetch failed", cause }),
  });

  yield* Effect.annotateCurrentSpan("status", resp.status);

  if (resp.status === 401) {
    return yield* new XUnauthorizedError({ endpoint });
  }
  if (!resp.ok) {
    return yield* new XApiError({
      endpoint,
      status: resp.status,
      message: resp.statusText,
    });
  }

  const json = yield* Effect.tryPromise({
    try: () => resp.json(),
    catch: (cause) =>
      new XApiError({
        endpoint,
        status: resp.status,
        message: "parse failed",
        cause,
      }),
  });

  const body = yield* Schema.decodeUnknown(MeResponse)(json).pipe(
    Effect.mapError(
      (cause) =>
        new XApiError({
          endpoint,
          status: resp.status,
          message: "schema mismatch",
          cause,
        })
    )
  );

  yield* Effect.annotateCurrentSpan("xUserId", body.data.id);
  yield* Effect.annotateCurrentSpan("xUsername", body.data.username);

  return {
    id: body.data.id,
    username: body.data.username,
    name: body.data.name,
    profileImageUrl: body.data.profile_image_url,
  };
});

const getBookmarksImpl = Effect.fn("XApiClient.getBookmarks")(function* (
  params: GetBookmarksParams
) {
  const endpoint = "bookmarks";
  yield* Effect.annotateCurrentSpan("endpoint", endpoint);
  yield* Effect.annotateCurrentSpan("xUserId", params.xUserId);
  yield* Effect.annotateCurrentSpan("maxResults", params.maxResults);
  yield* Effect.annotateCurrentSpan(
    "hasPaginationToken",
    !!params.paginationToken
  );

  const resp = yield* Effect.tryPromise({
    try: () => {
      const url = new URL(`${X_API_BASE}/users/${params.xUserId}/bookmarks`);
      url.searchParams.set("max_results", String(params.maxResults));
      url.searchParams.set("tweet.fields", "author_id,created_at,text");
      if (params.paginationToken) {
        url.searchParams.set("pagination_token", params.paginationToken);
      }
      return fetch(url.toString(), {
        headers: { Authorization: `Bearer ${params.accessToken}` },
      });
    },
    catch: (cause) =>
      new XApiError({ endpoint, status: 0, message: "fetch failed", cause }),
  });

  yield* Effect.annotateCurrentSpan("status", resp.status);

  if (resp.status === 401) {
    return yield* new XUnauthorizedError({ endpoint });
  }
  if (resp.status === 402) {
    return yield* new XPaymentRequiredError({ endpoint });
  }
  if (resp.status === 429) {
    const retryAfterMs = parseRetryAfterMs(resp.headers.get("retry-after"));
    yield* Effect.annotateCurrentSpan("retryAfterMs", retryAfterMs);
    return yield* new XRateLimitedError({ endpoint, retryAfterMs });
  }
  if (!resp.ok) {
    return yield* new XApiError({
      endpoint,
      status: resp.status,
      message: resp.statusText,
    });
  }

  const json = yield* Effect.tryPromise({
    try: () => resp.json(),
    catch: (cause) =>
      new XApiError({
        endpoint,
        status: resp.status,
        message: "parse failed",
        cause,
      }),
  });

  const body = yield* Schema.decodeUnknown(BookmarksResponse)(json).pipe(
    Effect.mapError(
      (cause) =>
        new XApiError({
          endpoint,
          status: resp.status,
          message: "schema mismatch",
          cause,
        })
    )
  );

  const data = body.data ?? [];
  yield* Effect.annotateCurrentSpan("resultCount", data.length);

  return {
    data,
    nextToken: body.meta?.next_token,
  };
});

export const XApiClientLive = Layer.succeed(XApiClient, {
  getMe: getMeImpl,
  getBookmarks: getBookmarksImpl,
});
