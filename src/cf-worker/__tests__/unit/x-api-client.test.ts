import { describe, it } from "@effect/vitest";
import { Effect, Either } from "effect";
import { expect } from "vitest";

import { XUserId } from "../../db/branded";
import {
  XApiError,
  XPaymentRequiredError,
  XRateLimitedError,
  XUnauthorizedError,
} from "../../x-sync/errors";
import { XApiClient } from "../../x-sync/services";
import { XApiClientLive } from "../../x-sync/services/x-api-client.live";

const X_USER = XUserId.make("u1");

interface CapturedRequest {
  url: string;
  init?: RequestInit;
}

type FetchPlan =
  | {
      kind: "json";
      status: number;
      body: unknown;
      headers?: Record<string, string>;
    }
  | { kind: "reject"; cause: unknown };

const urlOf = (input: RequestInfo | URL): string => {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
};

/**
 * Per-test fetch stub via Effect.acquireRelease — replaces globalThis.fetch
 * for the lifetime of the Effect Scope and always restores it. This avoids
 * the parallel-unsafe beforeEach/afterEach pattern.
 */
const withFetchStub = (plan: FetchPlan, captured?: CapturedRequest[]) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const original = globalThis.fetch;
      globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        captured?.push({ url: urlOf(input), init });
        if (plan.kind === "reject") return Promise.reject(plan.cause);
        return Promise.resolve(
          new Response(JSON.stringify(plan.body), {
            status: plan.status,
            headers: {
              "content-type": "application/json",
              ...plan.headers,
            },
          })
        );
      }) as typeof fetch;
      return original;
    }),
    (original) =>
      Effect.sync(() => {
        globalThis.fetch = original;
      })
  );

const runWithFetch = <A, E>(
  plan: FetchPlan,
  body: (captured: CapturedRequest[]) => Effect.Effect<A, E, XApiClient>
) =>
  Effect.gen(function* () {
    const captured: CapturedRequest[] = [];
    yield* withFetchStub(plan, captured);
    return yield* body(captured);
  }).pipe(Effect.scoped, Effect.provide(XApiClientLive));

describe("XApiClient (Live) — getMe", () => {
  it.effect("returns parsed user info on 200 with profile_image_url", () =>
    runWithFetch(
      {
        kind: "json",
        status: 200,
        body: {
          data: {
            id: "123",
            username: "alice",
            name: "Alice",
            profile_image_url: "https://x/avatar.jpg",
          },
        },
      },
      () =>
        Effect.flatMap(XApiClient, (c) => c.getMe("token")).pipe(
          Effect.either,
          Effect.tap((r) =>
            Effect.sync(() => {
              expect(Either.isRight(r)).toBe(true);
              if (Either.isRight(r)) {
                expect(r.right).toEqual({
                  id: "123",
                  username: "alice",
                  name: "Alice",
                  profileImageUrl: "https://x/avatar.jpg",
                });
              }
            })
          )
        )
    )
  );

  it.effect("returns user info on 200 without profile_image_url", () =>
    runWithFetch(
      {
        kind: "json",
        status: 200,
        body: { data: { id: "123", username: "alice", name: "Alice" } },
      },
      () =>
        Effect.flatMap(XApiClient, (c) => c.getMe("token")).pipe(
          Effect.either,
          Effect.tap((r) =>
            Effect.sync(() => {
              if (Either.isRight(r)) {
                expect(r.right.profileImageUrl).toBeUndefined();
              }
            })
          )
        )
    )
  );

  it.effect("fails with XUnauthorizedError carrying endpoint on 401", () =>
    runWithFetch({ kind: "json", status: 401, body: {} }, () =>
      Effect.flatMap(XApiClient, (c) => c.getMe("token")).pipe(
        Effect.either,
        Effect.tap((r) =>
          Effect.sync(() => {
            expect(Either.isLeft(r)).toBe(true);
            if (Either.isLeft(r)) {
              expect(r.left).toBeInstanceOf(XUnauthorizedError);
              expect((r.left as XUnauthorizedError).endpoint).toBe("users/me");
            }
          })
        )
      )
    )
  );

  it.effect("getMe: 402 maps to XApiError (NOT XPaymentRequiredError)", () =>
    runWithFetch({ kind: "json", status: 402, body: {} }, () =>
      Effect.flatMap(XApiClient, (c) => c.getMe("token")).pipe(
        Effect.either,
        Effect.tap((r) =>
          Effect.sync(() => {
            if (Either.isLeft(r)) {
              // Pins the deliberate asymmetry: only the bookmarks endpoint
              // distinguishes 402; /users/me falls through to XApiError.
              expect(r.left).toBeInstanceOf(XApiError);
              expect((r.left as XApiError).status).toBe(402);
            }
          })
        )
      )
    )
  );

  it.effect("getMe: 429 maps to XApiError (NOT XRateLimitedError)", () =>
    runWithFetch(
      { kind: "json", status: 429, body: {}, headers: { "retry-after": "10" } },
      () =>
        Effect.flatMap(XApiClient, (c) => c.getMe("token")).pipe(
          Effect.either,
          Effect.tap((r) =>
            Effect.sync(() => {
              if (Either.isLeft(r)) {
                expect(r.left).toBeInstanceOf(XApiError);
                expect((r.left as XApiError).status).toBe(429);
              }
            })
          )
        )
    )
  );

  it.effect("fails with XApiError on 500", () =>
    runWithFetch({ kind: "json", status: 500, body: {} }, () =>
      Effect.flatMap(XApiClient, (c) => c.getMe("token")).pipe(
        Effect.either,
        Effect.tap((r) =>
          Effect.sync(() => {
            if (Either.isLeft(r)) {
              expect(r.left).toBeInstanceOf(XApiError);
              expect((r.left as XApiError).status).toBe(500);
              expect((r.left as XApiError).endpoint).toBe("users/me");
            }
          })
        )
      )
    )
  );

  it.effect("fails with XApiError(status:0) on fetch rejection", () =>
    runWithFetch({ kind: "reject", cause: new Error("ECONNREFUSED") }, () =>
      Effect.flatMap(XApiClient, (c) => c.getMe("token")).pipe(
        Effect.either,
        Effect.tap((r) =>
          Effect.sync(() => {
            if (Either.isLeft(r)) {
              expect(r.left).toBeInstanceOf(XApiError);
              expect((r.left as XApiError).status).toBe(0);
            }
          })
        )
      )
    )
  );

  it.effect(
    "getMe: schema mismatch maps to XApiError(message:'schema mismatch')",
    () =>
      runWithFetch(
        { kind: "json", status: 200, body: { data: "garbage" } },
        () =>
          Effect.flatMap(XApiClient, (c) => c.getMe("token")).pipe(
            Effect.either,
            Effect.tap((r) =>
              Effect.sync(() => {
                if (Either.isLeft(r)) {
                  expect(r.left).toBeInstanceOf(XApiError);
                  expect((r.left as XApiError).message).toBe("schema mismatch");
                }
              })
            )
          )
      )
  );
});

describe("XApiClient (Live) — getBookmarks", () => {
  it.effect("returns flattened page on 200", () =>
    runWithFetch(
      {
        kind: "json",
        status: 200,
        body: {
          data: [{ id: "t1", text: "hello", author_id: "u1" }],
          meta: { next_token: "abc" },
        },
      },
      () =>
        Effect.flatMap(XApiClient, (c) =>
          c.getBookmarks({
            xUserId: X_USER,
            accessToken: "token",
            maxResults: 1,
          })
        ).pipe(
          Effect.either,
          Effect.tap((r) =>
            Effect.sync(() => {
              if (Either.isRight(r)) {
                expect(r.right).toEqual({
                  data: [{ id: "t1", text: "hello", author_id: "u1" }],
                  nextToken: "abc",
                });
              }
            })
          )
        )
    )
  );

  it.effect("returns empty page when data is missing", () =>
    runWithFetch({ kind: "json", status: 200, body: {} }, () =>
      Effect.flatMap(XApiClient, (c) =>
        c.getBookmarks({
          xUserId: X_USER,
          accessToken: "token",
          maxResults: 1,
        })
      ).pipe(
        Effect.either,
        Effect.tap((r) =>
          Effect.sync(() => {
            if (Either.isRight(r)) {
              expect(r.right).toEqual({ data: [], nextToken: undefined });
            }
          })
        )
      )
    )
  );

  it.effect(
    "passes paginationToken through as pagination_token URL param",
    () =>
      runWithFetch(
        {
          kind: "json",
          status: 200,
          body: { data: [], meta: { next_token: undefined } },
        },
        (captured) =>
          Effect.flatMap(XApiClient, (c) =>
            c.getBookmarks({
              xUserId: X_USER,
              accessToken: "token",
              maxResults: 50,
              paginationToken: "page-cursor-2",
            })
          ).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                expect(captured).toHaveLength(1);
                const url = new URL(captured[0].url);
                expect(url.searchParams.get("pagination_token")).toBe(
                  "page-cursor-2"
                );
                expect(url.searchParams.get("max_results")).toBe("50");
              })
            )
          )
      )
  );

  it.effect("maps 401 to XUnauthorizedError", () =>
    runWithFetch({ kind: "json", status: 401, body: {} }, () =>
      Effect.flatMap(XApiClient, (c) =>
        c.getBookmarks({
          xUserId: X_USER,
          accessToken: "token",
          maxResults: 1,
        })
      ).pipe(
        Effect.either,
        Effect.tap((r) =>
          Effect.sync(() => {
            if (Either.isLeft(r)) {
              expect(r.left).toBeInstanceOf(XUnauthorizedError);
              expect((r.left as XUnauthorizedError).endpoint).toBe("bookmarks");
            }
          })
        )
      )
    )
  );

  it.effect("maps 402 to XPaymentRequiredError", () =>
    runWithFetch({ kind: "json", status: 402, body: {} }, () =>
      Effect.flatMap(XApiClient, (c) =>
        c.getBookmarks({
          xUserId: X_USER,
          accessToken: "token",
          maxResults: 1,
        })
      ).pipe(
        Effect.either,
        Effect.tap((r) =>
          Effect.sync(() => {
            if (Either.isLeft(r)) {
              expect(r.left).toBeInstanceOf(XPaymentRequiredError);
            }
          })
        )
      )
    )
  );

  it.effect("maps 429 to XRateLimitedError with retry-after honored", () =>
    runWithFetch(
      { kind: "json", status: 429, body: {}, headers: { "retry-after": "90" } },
      () =>
        Effect.flatMap(XApiClient, (c) =>
          c.getBookmarks({
            xUserId: X_USER,
            accessToken: "token",
            maxResults: 1,
          })
        ).pipe(
          Effect.either,
          Effect.tap((r) =>
            Effect.sync(() => {
              if (Either.isLeft(r)) {
                expect(r.left).toBeInstanceOf(XRateLimitedError);
                expect((r.left as XRateLimitedError).retryAfterMs).toBe(90_000);
              }
            })
          )
        )
    )
  );

  it.effect("defaults retry-after to 60s when header is missing", () =>
    runWithFetch({ kind: "json", status: 429, body: {} }, () =>
      Effect.flatMap(XApiClient, (c) =>
        c.getBookmarks({
          xUserId: X_USER,
          accessToken: "token",
          maxResults: 1,
        })
      ).pipe(
        Effect.either,
        Effect.tap((r) =>
          Effect.sync(() => {
            if (Either.isLeft(r)) {
              expect(r.left).toBeInstanceOf(XRateLimitedError);
              expect((r.left as XRateLimitedError).retryAfterMs).toBe(60_000);
            }
          })
        )
      )
    )
  );

  it.effect("defaults retry-after to 60s when header is non-numeric", () =>
    runWithFetch(
      {
        kind: "json",
        status: 429,
        body: {},
        headers: { "retry-after": "soon" },
      },
      () =>
        Effect.flatMap(XApiClient, (c) =>
          c.getBookmarks({
            xUserId: X_USER,
            accessToken: "token",
            maxResults: 1,
          })
        ).pipe(
          Effect.either,
          Effect.tap((r) =>
            Effect.sync(() => {
              if (Either.isLeft(r)) {
                expect((r.left as XRateLimitedError).retryAfterMs).toBe(60_000);
              }
            })
          )
        )
    )
  );

  it.effect("maps 5xx to XApiError preserving status", () =>
    runWithFetch({ kind: "json", status: 503, body: {} }, () =>
      Effect.flatMap(XApiClient, (c) =>
        c.getBookmarks({
          xUserId: X_USER,
          accessToken: "token",
          maxResults: 1,
        })
      ).pipe(
        Effect.either,
        Effect.tap((r) =>
          Effect.sync(() => {
            if (Either.isLeft(r)) {
              expect(r.left).toBeInstanceOf(XApiError);
              expect((r.left as XApiError).status).toBe(503);
              expect((r.left as XApiError).endpoint).toBe("bookmarks");
            }
          })
        )
      )
    )
  );

  it.effect("fails on schema mismatch (data not an array)", () =>
    runWithFetch({ kind: "json", status: 200, body: { data: "garbage" } }, () =>
      Effect.flatMap(XApiClient, (c) =>
        c.getBookmarks({
          xUserId: X_USER,
          accessToken: "token",
          maxResults: 1,
        })
      ).pipe(
        Effect.either,
        Effect.tap((r) =>
          Effect.sync(() => {
            if (Either.isLeft(r)) {
              expect(r.left).toBeInstanceOf(XApiError);
              expect((r.left as XApiError).message).toBe("schema mismatch");
            }
          })
        )
      )
    )
  );
});
