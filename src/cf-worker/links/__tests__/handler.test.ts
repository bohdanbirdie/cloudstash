import { it, describe } from "@effect/vitest";
import { Effect, Layer, LogLevel, Logger } from "effect";
import { expect, vi } from "vitest";

import type { TierCapabilities } from "@/lib/plan";

import { AuthClient } from "../../auth/service";
import { Billing } from "../../billing/service";
import { ApiKey } from "../../db/branded";
import { DbError } from "../../db/service";
import { OrgNotFoundError } from "../../org/errors";
import { parseListParams } from "../api";
import { handleListLinks, listLinksEffect } from "../handler";

function createEnv(overrides: { listLinks?: ReturnType<typeof vi.fn> } = {}) {
  const listLinks =
    overrides.listLinks ??
    vi.fn().mockResolvedValue({ links: [], total: 0, nextCursor: null });
  return {
    Chat: {
      idFromName: vi.fn().mockReturnValue("do-id"),
      get: vi.fn().mockReturnValue({ listLinks }),
    },
    _listLinks: listLinks,
  };
}

function makeAuthLayer(
  verifyApiKey: (opts: { body: { key: string } }) => Promise<unknown>
): Layer.Layer<AuthClient> {
  return Layer.succeed(AuthClient, {
    api: { verifyApiKey },
  } as unknown as AuthClient["Type"]);
}

function makeBillingLayer(
  capabilities: Billing["capabilities"]
): Layer.Layer<Billing> {
  return Layer.succeed(Billing, { capabilities } as unknown as Billing);
}

const capsLayer = (publicApi: boolean): Layer.Layer<Billing> =>
  makeBillingLayer(() => Effect.succeed({ publicApi } as TierCapabilities));

function okParams() {
  const p = parseListParams(new URL("https://x.test/api/links"));
  if (!p.ok) throw new Error("unreachable");
  return p;
}

function run(
  env: ReturnType<typeof createEnv>,
  authLayer: Layer.Layer<AuthClient>,
  billingLayer: Layer.Layer<Billing> = capsLayer(true)
) {
  return listLinksEffect(
    ApiKey.make("valid-key"),
    okParams(),
    env as never
  ).pipe(
    Effect.provide(Layer.mergeAll(authLayer, billingLayer)),
    Logger.withMinimumLogLevel(LogLevel.Error)
  );
}

const validKeyResponse = {
  valid: true,
  key: { metadata: { orgId: "org-1" } },
};

const validAuthLayer = makeAuthLayer(() => Promise.resolve(validKeyResponse));

describe("handleListLinks pre-checks", () => {
  it("returns 401 without a bearer token", async () => {
    const response = await handleListLinks(
      new Request("https://x.test/api/links"),
      createEnv() as never
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for an invalid query param", async () => {
    const response = await handleListLinks(
      new Request("https://x.test/api/links?state=bogus", {
        headers: { authorization: "Bearer k" },
      }),
      createEnv() as never
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid state" });
  });
});

describe("listLinksEffect", () => {
  it.effect("returns 503 when the auth backend is unavailable", () => {
    const authLayer = makeAuthLayer(() => Promise.reject(new Error("down")));
    const env = createEnv();

    return run(env, authLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(503);
          expect(await response.json()).toEqual({
            error: "Auth backend unavailable",
          });
          expect(env._listLinks).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("returns 401 when the API key is invalid", () => {
    const authLayer = makeAuthLayer(() =>
      Promise.resolve({ valid: false, key: null })
    );
    const env = createEnv();

    return run(env, authLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({ error: "Unauthorized" });
          expect(env._listLinks).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("returns 401 when the API key metadata has no orgId", () => {
    const authLayer = makeAuthLayer(() =>
      Promise.resolve({ valid: true, key: { metadata: {} } })
    );
    const env = createEnv();

    return run(env, authLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(401);
          expect(await response.json()).toEqual({ error: "Unauthorized" });
          expect(env._listLinks).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect(
    "returns 402 and never reads the store when org lacks publicApi",
    () => {
      const env = createEnv();

      return run(env, validAuthLayer, capsLayer(false)).pipe(
        Effect.tap((response) =>
          Effect.promise(async () => {
            expect(response.status).toBe(402);
            expect(await response.json()).toEqual({
              error: "Upgrade required",
              capability: "publicApi",
              requiredTier: "plus",
            });
            expect(env._listLinks).not.toHaveBeenCalled();
          })
        )
      );
    }
  );

  it.effect("returns 404 when the org no longer exists", () => {
    const env = createEnv();
    const billingLayer = makeBillingLayer((orgId) =>
      OrgNotFoundError.make({ orgId })
    );

    return run(env, validAuthLayer, billingLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(404);
          expect(await response.json()).toEqual({
            error: "Organization not found",
          });
          expect(env._listLinks).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("returns 500 when the capability lookup errors", () => {
    const env = createEnv();
    const billingLayer = makeBillingLayer(() => new DbError({ cause: "boom" }));

    return run(env, validAuthLayer, billingLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(500);
          expect(await response.json()).toEqual({ error: "Internal error" });
          expect(env._listLinks).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("returns 500 when the store RPC fails", () => {
    const env = createEnv({
      listLinks: vi.fn().mockRejectedValue(new Error("rpc down")),
    });

    return run(env, validAuthLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(500);
          expect(await response.json()).toEqual({ error: "Internal error" });
        })
      )
    );
  });

  it.effect("returns 200 with the page on success", () => {
    const page = {
      links: [{ id: "lnk_1", url: "https://example.com" }],
      total: 1,
      nextCursor: null,
    };
    const env = createEnv({ listLinks: vi.fn().mockResolvedValue(page) });

    return run(env, validAuthLayer).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual(page);
          expect(env.Chat.idFromName).toHaveBeenCalledWith("org-1");
          expect(env._listLinks).toHaveBeenCalledWith({
            state: "all",
            limit: 50,
            cursor: null,
          });
        })
      )
    );
  });
});
