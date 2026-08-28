import { describe, it } from "@effect/vitest";
import { Effect, Layer, References } from "effect";
import { expect, vi } from "vitest";

import type { TierCapabilities } from "@/lib/plan";

import { AuthClient } from "../../auth/service";
import {
  WorkspaceAccess,
  makeWorkspaceAccess,
} from "../../auth/workspace-access";
import { Billing } from "../../billing/service";
import { ApiKey } from "../../db/branded";
import { DbError } from "../../db/service";
import { OrgNotFoundError } from "../../org/errors";
import { handleListLinks, listLinksEffect } from "../handler";

const createEnv = (
  overrides: {
    listLinks?: ReturnType<typeof vi.fn>;
    searchLinks?: ReturnType<typeof vi.fn>;
  } = {}
) => {
  const listLinks =
    overrides.listLinks ??
    vi.fn().mockResolvedValue({
      ok: true,
      value: { links: [], total: 0, nextCursor: null },
    });
  const searchLinks =
    overrides.searchLinks ?? vi.fn().mockResolvedValue({ ok: true, value: [] });
  return {
    LIBRARY_DO: {
      idFromName: vi.fn().mockReturnValue("do-id"),
      get: vi.fn().mockReturnValue({ listLinks, searchLinks }),
    },
    listLinks,
    searchLinks,
  };
};

const makeAuthLayer = (
  verifyApiKey: (opts: { body: { key: string } }) => Promise<unknown>
): Layer.Layer<AuthClient | WorkspaceAccess> => {
  const authLayer = Layer.succeed(AuthClient, {
    api: { verifyApiKey },
  } as unknown as AuthClient["Service"]);
  const accessLayer = Layer.effect(
    WorkspaceAccess,
    Effect.map(AuthClient, (auth) =>
      makeWorkspaceAccess(auth, {
        query: {
          user: { findFirst: () => Promise.resolve({ approved: true }) },
          member: { findFirst: () => Promise.resolve({ id: "member-1" }) },
        },
      } as never)
    )
  ).pipe(Layer.provide(authLayer));
  return Layer.merge(authLayer, accessLayer);
};

const makeBillingLayer = (
  capabilities: Billing["Service"]["capabilities"]
): Layer.Layer<Billing> =>
  Layer.succeed(Billing, {
    capabilities,
  } as unknown as Billing["Service"]);

const capabilities = (publicApi: boolean): Layer.Layer<Billing> =>
  makeBillingLayer(() => Effect.succeed({ publicApi } as TierCapabilities));

const validKey = {
  valid: true,
  key: { metadata: { orgId: "org-1" }, referenceId: "user-1" },
};

const run = (
  env: ReturnType<typeof createEnv>,
  auth: Layer.Layer<AuthClient | WorkspaceAccess>,
  billing: Layer.Layer<Billing> = capabilities(true),
  url = "https://worker.test/api/links"
) =>
  listLinksEffect(
    ApiKey.make("valid-key"),
    new Request(url),
    env as never
  ).pipe(
    Effect.provide(Layer.mergeAll(auth, billing)),
    Effect.provideService(References.MinimumLogLevel, "Error")
  );

describe("Links API authorization", () => {
  it("returns 401 before building services when the bearer token is missing", async () => {
    const response = await handleListLinks(
      new Request("https://worker.test/api/links"),
      createEnv() as never
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it.effect("fails closed when the API key is invalid", () => {
    const env = createEnv();
    return run(
      env,
      makeAuthLayer(() => Promise.resolve({ valid: false, key: null }))
    ).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(401);
          expect(env.listLinks).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("enforces the Public API capability before workspace RPC", () => {
    const env = createEnv();
    return run(
      env,
      makeAuthLayer(() => Promise.resolve(validKey)),
      capabilities(false)
    ).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(402);
          expect(await response.json()).toMatchObject({
            capability: "publicApi",
          });
          expect(env.listLinks).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect(
    "maps capability storage failures without calling the workspace",
    () => {
      const env = createEnv();
      return run(
        env,
        makeAuthLayer(() => Promise.resolve(validKey)),
        makeBillingLayer(() => new DbError({ cause: "down" }))
      ).pipe(
        Effect.tap((response) =>
          Effect.sync(() => {
            expect(response.status).toBe(500);
            expect(env.listLinks).not.toHaveBeenCalled();
          })
        )
      );
    }
  );

  it.effect("maps a removed workspace to 404", () => {
    const env = createEnv();
    return run(
      env,
      makeAuthLayer(() => Promise.resolve(validKey)),
      makeBillingLayer((orgId) => OrgNotFoundError.make({ orgId }))
    ).pipe(
      Effect.tap((response) =>
        Effect.sync(() => expect(response.status).toBe(404))
      )
    );
  });
});

describe("Links API list boundary", () => {
  const auth = makeAuthLayer(() => Promise.resolve(validKey));

  it.effect("strictly rejects invalid query parameters", () => {
    const env = createEnv();
    return run(
      env,
      auth,
      capabilities(true),
      "https://worker.test/api/links?state=bogus"
    ).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(400);
          expect(await response.json()).toEqual({ error: "Invalid request" });
          expect(env.listLinks).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("returns a page from the named workspace", () => {
    const page = { links: [], total: 0, nextCursor: null };
    const env = createEnv({
      listLinks: vi.fn().mockResolvedValue({ ok: true, value: page }),
    });
    return run(env, auth).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual(page);
          expect(env.LIBRARY_DO.idFromName).toHaveBeenCalledWith("org-1");
          expect(env.listLinks).toHaveBeenCalledWith({});
        })
      )
    );
  });

  it.effect("forwards explicit all-term search and full-history state", () => {
    const env = createEnv();
    return run(
      env,
      auth,
      capabilities(true),
      "https://worker.test/api/links?q=alpha%20beta&match=all&state=any&limit=7"
    ).pipe(
      Effect.tap((response) =>
        Effect.sync(() => {
          expect(response.status).toBe(200);
          expect(env.searchLinks).toHaveBeenCalledWith({
            limit: 7,
            match: "all",
            query: "alpha beta",
            state: "any",
          });
          expect(env.listLinks).not.toHaveBeenCalled();
        })
      )
    );
  });

  it.effect("maps RPC rejection to a stable 500 response", () => {
    const env = createEnv({
      listLinks: vi.fn().mockRejectedValue(new Error("RPC unavailable")),
    });
    return run(env, auth).pipe(
      Effect.tap((response) =>
        Effect.promise(async () => {
          expect(response.status).toBe(500);
          expect(await response.json()).toEqual({ error: "Internal error" });
        })
      )
    );
  });
});
