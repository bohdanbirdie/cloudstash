import { describe, it } from "@effect/vitest";
import { Effect, Layer, References } from "effect";
import { expect, vi } from "vitest";

import { Billing } from "../../billing/service";
import { createDb } from "../../db";
import { DbClient } from "../../db/service";
import type { Env } from "../../shared";
import { handleAuthRequest } from "../handler";
import { authBackendUnavailable } from "../mcp-resource";
import { AuthClient } from "../service";
import { WorkspaceAccess } from "../workspace-access";

describe("auth request initialization", () => {
  it.effect(
    "returns 503 before Better Auth when MCP resource seeding fails",
    () =>
      Effect.gen(function* () {
        const cause = new Error("D1 unavailable");
        const d1 = {
          prepare: vi.fn(() => ({
            bind: vi.fn(() => ({ run: vi.fn(() => Promise.reject(cause)) })),
          })),
        } as unknown as D1Database;
        const authHandler = vi.fn(() => Promise.resolve(new Response(null)));
        const env = {
          BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
          BETTER_AUTH_URL: "https://cloudstash.test",
          DB: d1,
        } as Env;
        const layer = Layer.mergeAll(
          Layer.succeed(DbClient, createDb(d1)),
          Layer.succeed(AuthClient, {
            handler: authHandler,
          } as unknown as AuthClient["Service"]),
          Layer.succeed(Billing, {} as Billing["Service"]),
          Layer.succeed(WorkspaceAccess, {} as WorkspaceAccess["Service"])
        );

        const response = yield* handleAuthRequest(
          new Request("https://cloudstash.test/api/auth/get-session"),
          env
        ).pipe(
          Effect.withSpan("API.authHandler"),
          Effect.catchTag("DbError", (error) =>
            authBackendUnavailable(error.cause)
          ),
          Effect.provide(layer),
          Effect.provideService(References.MinimumLogLevel, "Error")
        );

        expect(response.status).toBe(503);
        expect(yield* Effect.promise(() => response.json())).toEqual({
          error: "Authentication backend unavailable",
        });
        expect(authHandler).not.toHaveBeenCalled();
      })
  );
});
