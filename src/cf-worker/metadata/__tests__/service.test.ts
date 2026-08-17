import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { vi } from "vitest";

import {
  WorkspaceAccess,
  WorkspaceAccessBackendError,
  WorkspaceCredentialInvalidError,
  WorkspaceMembershipRevokedError,
  WorkspaceUserUnapprovedError,
} from "../../auth/workspace-access";
import { OrgId, UserId } from "../../db/branded";
import { MetadataFetchError } from "../errors";
import { metadataErrorToResponse, metadataRequestToResponse } from "../service";

const authorization = {
  orgId: OrgId.make("org-1"),
  userId: UserId.make("user-1"),
};

const accessLayer = (
  result:
    | typeof authorization
    | WorkspaceCredentialInvalidError
    | WorkspaceUserUnapprovedError
    | WorkspaceMembershipRevokedError
    | WorkspaceAccessBackendError = authorization
) =>
  Layer.succeed(
    WorkspaceAccess,
    WorkspaceAccess.of({
      authorizeApiKey: () => Effect.die("not used"),
      authorizeIdentity: () => Effect.die("Identity authorization not used"),
      authorizeSession: () =>
        result instanceof Error ? Effect.fail(result) : Effect.succeed(result),
    })
  );

const expectPrivateNoStore = (response: Response) =>
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");

const makeRateLimiter = (result: unknown = true) => {
  const limit = vi.fn((_options: { key: string }) =>
    result instanceof Error
      ? Promise.reject(result)
      : Promise.resolve({ success: result })
  );
  return { limit };
};

const youtubeResponse = (thumbnail = "https://img.example/video.jpg") =>
  new Response(
    JSON.stringify({
      title: "Bounded preview",
      thumbnail_url: thumbnail,
    }),
    { headers: { "Content-Type": "application/json" } }
  );

const request = (target = "https://youtube.com/watch?v=abc") =>
  new Request(
    `https://cloudstash.dev/api/metadata?url=${encodeURIComponent(target)}`,
    { headers: { Cookie: "session=test" } }
  );

const authorizationCases = [
  [
    "invalid session",
    new WorkspaceCredentialInvalidError({ credential: "session" }),
    401,
  ],
  [
    "unapproved user",
    new WorkspaceUserUnapprovedError({ userId: UserId.make("user-1") }),
    403,
  ],
  [
    "revoked membership",
    new WorkspaceMembershipRevokedError(authorization),
    403,
  ],
  [
    "auth backend failure",
    new WorkspaceAccessBackendError({
      cause: new Error("offline"),
      operation: "getSession",
    }),
    503,
  ],
] as const;

const upstreamFailureCases = [
  [
    "oversized response",
    () =>
      new Response(new Uint8Array(2_000_001), {
        headers: { "Content-Type": "text/html" },
      }),
    502,
  ],
  [
    "unsupported content type",
    () =>
      new Response("binary", {
        headers: { "Content-Type": "application/pdf" },
      }),
    502,
  ],
  [
    "hostile redirect",
    () =>
      new Response(null, {
        headers: { Location: "http://127.0.0.1/private" },
        status: 302,
      }),
    502,
  ],
] as const;

const run = (
  targetRequest: Request,
  options: {
    access?: Parameters<typeof accessLayer>[0];
    applicationHostname?: string;
    fetcher?: typeof fetch;
    limiter?: ReturnType<typeof makeRateLimiter>;
  } = {}
) => {
  const limiter = options.limiter ?? makeRateLimiter();
  const fetcher =
    options.fetcher ??
    (vi.fn().mockResolvedValue(youtubeResponse()) as unknown as typeof fetch);
  return metadataRequestToResponse(
    targetRequest,
    limiter as unknown as RateLimit,
    options.applicationHostname ?? "cloudstash.dev",
    fetcher
  ).pipe(Effect.provide(accessLayer(options.access)));
};

describe("metadataRequestToResponse", () => {
  it.live.each(authorizationCases)(
    "maps %s before rate limiting or fetch",
    ([_name, error, status]) =>
      Effect.gen(function* () {
        const limiter = makeRateLimiter();
        const fetcher = vi.fn();
        const response = yield* run(request(), {
          access: error,
          fetcher: fetcher as unknown as typeof fetch,
          limiter,
        });

        expect(response.status).toBe(status);
        expectPrivateNoStore(response);
        expect(limiter.limit).not.toHaveBeenCalled();
        expect(fetcher).not.toHaveBeenCalled();
      })
  );

  it.live.each([
    "javascript:alert(1)",
    "http://127.0.0.1/",
    "http://service.internal/",
    "http://service.internal./",
    "https://cloudstash.dev/private",
    "https://cloudstash.dev./private",
  ])("rejects hostile target %s before fetch", (target) =>
    Effect.gen(function* () {
      const fetcher = vi.fn();
      const response = yield* run(request(target), {
        fetcher: fetcher as unknown as typeof fetch,
      });
      expect(response.status).toBe(400);
      expectPrivateNoStore(response);
      expect(fetcher).not.toHaveBeenCalled();
    })
  );

  it.live(
    "rejects the configured application host when the request host differs",
    () =>
      Effect.gen(function* () {
        const fetcher = vi.fn();
        const response = yield* run(
          new Request(
            `https://preview-proxy.example/api/metadata?url=${encodeURIComponent("https://cloudstash.dev/private")}`
          ),
          {
            applicationHostname: "cloudstash.dev",
            fetcher: fetcher as unknown as typeof fetch,
          }
        );

        expect(response.status).toBe(400);
        expect(fetcher).not.toHaveBeenCalled();
      })
  );

  it.live("returns 400 for a missing target", () =>
    Effect.gen(function* () {
      const response = yield* run(
        new Request("https://cloudstash.dev/api/metadata")
      );
      expect(response.status).toBe(400);
    })
  );

  it.live("returns structured retry guidance when limited", () =>
    Effect.gen(function* () {
      const fetcher = vi.fn();
      const response = yield* run(request(), {
        fetcher: fetcher as unknown as typeof fetch,
        limiter: makeRateLimiter(false),
      });
      expect(response.status).toBe(429);
      expect(response.headers.get("Retry-After")).toBe("60");
      expect(yield* Effect.promise(() => response.json())).toEqual({
        error: "Metadata preview temporarily limited",
        retryAfterSeconds: 60,
      });
      expect(fetcher).not.toHaveBeenCalled();
    })
  );

  it.live("returns 503 when the dedicated limiter is unavailable", () =>
    Effect.gen(function* () {
      const response = yield* run(request(), {
        limiter: makeRateLimiter(new Error("offline")),
      });
      expect(response.status).toBe(503);
    })
  );

  it.live("returns 503 for a malformed limiter outcome", () =>
    Effect.gen(function* () {
      const response = yield* run(request(), {
        limiter: makeRateLimiter("false"),
      });
      expect(response.status).toBe(503);
    })
  );

  it.live("preserves provider extraction and prevents client caching", () =>
    Effect.gen(function* () {
      const response = yield* run(request());
      expect(response.status).toBe(200);
      expectPrivateNoStore(response);
      expect(yield* Effect.promise(() => response.json())).toMatchObject({
        image: "https://img.example/video.jpg",
        title: "Bounded preview",
      });
    })
  );

  it.live("permits a normal burst and keys every request by user", () =>
    Effect.gen(function* () {
      const limiter = makeRateLimiter();
      const fetcher = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(youtubeResponse())
        ) as unknown as typeof fetch;
      const responses = yield* Effect.all(
        Array.from({ length: 20 }, () => run(request(), { fetcher, limiter })),
        { concurrency: "unbounded" }
      );
      expect(responses.every(({ status }) => status === 200)).toBe(true);
      expect(limiter.limit).toHaveBeenCalledTimes(20);
      for (const [call] of limiter.limit.mock.calls) {
        expect(call).toEqual({ key: "user-1" });
      }
    })
  );

  it.live.each(upstreamFailureCases)(
    "maps %s to a generic upstream failure",
    ([_name, make, status]) =>
      Effect.gen(function* () {
        const response = yield* run(request("https://example.com/page"), {
          fetcher: vi.fn().mockResolvedValue(make()) as unknown as typeof fetch,
        });
        expect(response.status).toBe(status);
        expect(yield* Effect.promise(() => response.json())).toEqual({
          error: "Metadata preview unavailable",
        });
      })
  );

  it.live("does not persist a hostile provider asset URL", () =>
    Effect.gen(function* () {
      const response = yield* run(request(), {
        fetcher: vi
          .fn()
          .mockResolvedValue(
            youtubeResponse("javascript:alert(1)")
          ) as unknown as typeof fetch,
      });
      expect(response.status).toBe(502);
      expect(
        JSON.stringify(yield* Effect.promise(() => response.json()))
      ).not.toContain("javascript:");
    })
  );

  it.effect("maps metadata timeouts to 504", () =>
    Effect.gen(function* () {
      const response = yield* metadataErrorToResponse(
        new MetadataFetchError({ reason: "timeout" })
      );
      expect(response.status).toBe(504);
    })
  );
});
