import { Effect, Layer, LogLevel, Logger } from "effect";
import { describe, expect, it } from "vitest";

import {
  ChatFeatureDisabledError,
  checkChatFeatureEnabled,
} from "../../chat-agent/auth";
import { DbError } from "../../db/service";
import { OrgFeatures } from "../../org/features-service";

function makeOrgFeaturesLayer(overrides: Partial<OrgFeatures["Type"]> = {}) {
  return Layer.succeed(OrgFeatures, {
    get: () => Effect.succeed({}),
    exists: () => Effect.succeed(true),
    update: () => Effect.void,
    listWithOwners: () => Effect.succeed([]),
    ...overrides,
  });
}

describe("checkChatFeatureEnabled", () => {
  it("succeeds when chatAgentEnabled is true", async () => {
    const layer = makeOrgFeaturesLayer({
      get: () => Effect.succeed({ chatAgentEnabled: true }),
    });

    await Effect.runPromise(
      checkChatFeatureEnabled("org-1").pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.Error)
      )
    );
  });

  it("fails with ChatFeatureDisabledError when chatAgentEnabled is false", async () => {
    const layer = makeOrgFeaturesLayer({
      get: () => Effect.succeed({ chatAgentEnabled: false }),
    });

    const error = await Effect.runPromise(
      checkChatFeatureEnabled("org-1").pipe(
        Effect.provide(layer),
        Effect.flip,
        Logger.withMinimumLogLevel(LogLevel.Error)
      )
    );

    expect(error._tag).toBe("ChatFeatureDisabledError");
    expect((error as ChatFeatureDisabledError).status).toBe(403);
  });

  it("fails with ChatFeatureDisabledError when features are empty", async () => {
    const layer = makeOrgFeaturesLayer({
      get: () => Effect.succeed({}),
    });

    const error = await Effect.runPromise(
      checkChatFeatureEnabled("org-1").pipe(
        Effect.provide(layer),
        Effect.flip,
        Logger.withMinimumLogLevel(LogLevel.Error)
      )
    );

    expect(error._tag).toBe("ChatFeatureDisabledError");
  });

  it("propagates DbError from OrgFeatures.get", async () => {
    const layer = makeOrgFeaturesLayer({
      get: () => Effect.fail(new DbError({ cause: new Error("D1 down") })),
    });

    const error = await Effect.runPromise(
      checkChatFeatureEnabled("org-1").pipe(
        Effect.provide(layer),
        Effect.flip,
        Logger.withMinimumLogLevel(LogLevel.Error)
      )
    );

    expect(error._tag).toBe("DbError");
  });

  it("passes the correct orgId to get", async () => {
    let capturedOrgId: string | null = null;

    const layer = makeOrgFeaturesLayer({
      get: (orgId) => {
        capturedOrgId = orgId;
        return Effect.succeed({ chatAgentEnabled: true });
      },
    });

    await Effect.runPromise(
      checkChatFeatureEnabled("workspace-42").pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.Error)
      )
    );

    expect(capturedOrgId).toBe("workspace-42");
  });
});

describe("OrgFeatures service contract", () => {
  it("get returns features for an org", async () => {
    const features = { aiSummary: true, chatAgentEnabled: true };
    const layer = makeOrgFeaturesLayer({
      get: () => Effect.succeed(features),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* OrgFeatures;
        return yield* svc.get("org-1");
      }).pipe(Effect.provide(layer))
    );

    expect(result).toEqual(features);
  });

  it("exists returns true for existing org", async () => {
    const layer = makeOrgFeaturesLayer({
      exists: () => Effect.succeed(true),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* OrgFeatures;
        return yield* svc.exists("org-1");
      }).pipe(Effect.provide(layer))
    );

    expect(result).toBe(true);
  });

  it("exists returns false for missing org", async () => {
    const layer = makeOrgFeaturesLayer({
      exists: () => Effect.succeed(false),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* OrgFeatures;
        return yield* svc.exists("org-missing");
      }).pipe(Effect.provide(layer))
    );

    expect(result).toBe(false);
  });

  it("listWithOwners returns workspace list", async () => {
    const workspaces = [
      {
        id: "org-1",
        name: "Test Workspace",
        slug: "test",
        creatorEmail: "owner@test.com",
        features: {},
      },
    ];
    const layer = makeOrgFeaturesLayer({
      listWithOwners: () => Effect.succeed(workspaces),
    });

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* OrgFeatures;
        return yield* svc.listWithOwners();
      }).pipe(Effect.provide(layer))
    );

    expect(result).toEqual(workspaces);
  });

  it("update calls with correct args", async () => {
    let capturedArgs: { orgId: string; features: unknown } | null = null;

    const layer = makeOrgFeaturesLayer({
      update: (orgId, features) => {
        capturedArgs = { orgId, features };
        return Effect.void;
      },
    });

    await Effect.runPromise(
      Effect.gen(function* () {
        const svc = yield* OrgFeatures;
        yield* svc.update("org-1", { aiSummary: true });
      }).pipe(Effect.provide(layer))
    );

    expect(capturedArgs).toEqual({
      orgId: "org-1",
      features: { aiSummary: true },
    });
  });
});
