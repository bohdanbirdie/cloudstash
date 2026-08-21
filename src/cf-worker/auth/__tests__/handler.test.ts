import { describe, it } from "@effect/vitest";
import { Effect, References } from "effect";
import { expect, vi } from "vitest";

import { DbError } from "../../db/service";
import { runHandler } from "../../runtime";
import type { Env } from "../../shared";
import { handleAuthRequest } from "../handler";
import { authBackendUnavailable } from "../mcp-resource";

describe("auth request initialization", () => {
  it.effect("returns 503 when app-wide MCP resource initialization fails", () =>
    Effect.gen(function* () {
      const cause = new Error("D1 unavailable");
      const d1 = {
        prepare: vi.fn(() => ({
          bind: vi.fn(() => ({ run: vi.fn(() => Promise.reject(cause)) })),
        })),
      } as unknown as D1Database;
      const env = {
        BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
        BETTER_AUTH_URL: "https://cloudstash.test",
        DB: d1,
      } as Env;
      const response = yield* Effect.promise(() =>
        runHandler(
          env,
          handleAuthRequest(
            new Request("https://cloudstash.test/api/auth/get-session"),
            env
          ).pipe(
            Effect.withSpan("API.authHandler"),
            Effect.catchTag("DbError", (error: DbError) =>
              authBackendUnavailable(error.cause)
            )
          ),
          authBackendUnavailable
        )
      ).pipe(Effect.provideService(References.MinimumLogLevel, "Error"));

      expect(response.status).toBe(503);
      expect(yield* Effect.promise(() => response.json())).toEqual({
        error: "Authentication backend unavailable",
      });
    })
  );
});
