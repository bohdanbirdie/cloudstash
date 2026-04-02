import { it, describe } from "@effect/vitest";
import { Effect, Layer, LogLevel, Logger } from "effect";
import { expect } from "vitest";

import {
  ChatFeatureDisabledError,
  checkChatFeatureEnabled,
} from "../../chat-agent/auth";
import { OrgId } from "../../db/branded";
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
  it.effect("succeeds when chatAgentEnabled is true", () => {
    const layer = makeOrgFeaturesLayer({
      get: () => Effect.succeed({ chatAgentEnabled: true }),
    });

    return checkChatFeatureEnabled(OrgId.make("org-1")).pipe(
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.Error)
    );
  });

  it.effect(
    "fails with ChatFeatureDisabledError when chatAgentEnabled is false",
    () => {
      const layer = makeOrgFeaturesLayer({
        get: () => Effect.succeed({ chatAgentEnabled: false }),
      });

      return checkChatFeatureEnabled(OrgId.make("org-1")).pipe(
        Effect.provide(layer),
        Effect.flip,
        Logger.withMinimumLogLevel(LogLevel.Error),
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error._tag).toBe("ChatFeatureDisabledError");
            expect((error as ChatFeatureDisabledError).status).toBe(403);
          })
        )
      );
    }
  );

  it.effect(
    "fails with ChatFeatureDisabledError when features are empty",
    () => {
      const layer = makeOrgFeaturesLayer({
        get: () => Effect.succeed({}),
      });

      return checkChatFeatureEnabled(OrgId.make("org-1")).pipe(
        Effect.provide(layer),
        Effect.flip,
        Logger.withMinimumLogLevel(LogLevel.Error),
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error._tag).toBe("ChatFeatureDisabledError");
          })
        )
      );
    }
  );

  it.effect("propagates DbError from OrgFeatures.get", () => {
    const layer = makeOrgFeaturesLayer({
      get: () => Effect.fail(new DbError({ cause: new Error("D1 down") })),
    });

    return checkChatFeatureEnabled(OrgId.make("org-1")).pipe(
      Effect.provide(layer),
      Effect.flip,
      Logger.withMinimumLogLevel(LogLevel.Error),
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("DbError");
        })
      )
    );
  });

  it.effect("passes the correct orgId to get", () => {
    let capturedOrgId: string | null = null;

    const layer = makeOrgFeaturesLayer({
      get: (orgId) => {
        capturedOrgId = orgId;
        return Effect.succeed({ chatAgentEnabled: true });
      },
    });

    return checkChatFeatureEnabled(OrgId.make("workspace-42")).pipe(
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.Error),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(capturedOrgId).toBe("workspace-42");
        })
      )
    );
  });
});

describe("OrgFeatures service contract", () => {
  it.effect("get returns features for an org", () => {
    const features = { aiSummary: true, chatAgentEnabled: true };
    const layer = makeOrgFeaturesLayer({
      get: () => Effect.succeed(features),
    });

    return Effect.gen(function* () {
      const svc = yield* OrgFeatures;
      const result = yield* svc.get(OrgId.make("org-1"));
      expect(result).toEqual(features);
    }).pipe(Effect.provide(layer));
  });

  it.effect("exists returns true for existing org", () => {
    const layer = makeOrgFeaturesLayer({
      exists: () => Effect.succeed(true),
    });

    return Effect.gen(function* () {
      const svc = yield* OrgFeatures;
      const result = yield* svc.exists(OrgId.make("org-1"));
      expect(result).toBe(true);
    }).pipe(Effect.provide(layer));
  });

  it.effect("exists returns false for missing org", () => {
    const layer = makeOrgFeaturesLayer({
      exists: () => Effect.succeed(false),
    });

    return Effect.gen(function* () {
      const svc = yield* OrgFeatures;
      const result = yield* svc.exists(OrgId.make("org-missing"));
      expect(result).toBe(false);
    }).pipe(Effect.provide(layer));
  });

  it.effect("listWithOwners returns workspace list", () => {
    const workspaces = [
      {
        id: OrgId.make("org-1"),
        name: "Test Workspace",
        slug: "test",
        creatorEmail: "owner@test.com",
        features: {},
      },
    ];
    const layer = makeOrgFeaturesLayer({
      listWithOwners: () => Effect.succeed(workspaces),
    });

    return Effect.gen(function* () {
      const svc = yield* OrgFeatures;
      const result = yield* svc.listWithOwners();
      expect(result).toEqual(workspaces);
    }).pipe(Effect.provide(layer));
  });

  it.effect("update calls with correct args", () => {
    let capturedArgs: { orgId: string; features: unknown } | null = null;

    const layer = makeOrgFeaturesLayer({
      update: (orgId, features) => {
        capturedArgs = { orgId, features };
        return Effect.void;
      },
    });

    return Effect.gen(function* () {
      const svc = yield* OrgFeatures;
      yield* svc.update(OrgId.make("org-1"), { aiSummary: true });
      expect(capturedArgs).toEqual({
        orgId: "org-1",
        features: { aiSummary: true },
      });
    }).pipe(Effect.provide(layer));
  });
});
