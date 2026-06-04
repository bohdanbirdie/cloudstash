import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, LogLevel, Logger } from "effect";

import {
  capabilitiesFor,
  mergeCapabilities,
  TIER_CAPABILITIES,
} from "@/lib/plan";

import { Billing } from "../../billing/service";
import {
  ChatFeatureDisabledError,
  checkChatFeatureEnabled,
} from "../../chat-agent/auth";
import { OrgId } from "../../db/branded";
import { DbError } from "../../db/service";
import { OrgNotFoundError } from "../../org/errors";

type BillingImpl = ConstructorParameters<typeof Billing>[0];

function makeBillingLayer(overrides: Partial<BillingImpl> = {}) {
  const defaults: BillingImpl = {
    capabilities: () => Effect.succeed(capabilitiesFor("free")),
    tier: () => Effect.succeed("free"),
    subscription: () =>
      Effect.succeed({ cancelAtPeriodEnd: false, currentPeriodEnd: null }),
    getOverrides: () => Effect.succeed({}),
    setTier: () => Effect.void,
    setOverride: () => Effect.void,
    exists: () => Effect.succeed(true),
    listWithOwners: () => Effect.succeed([]),
  };
  return Layer.succeed(Billing, new Billing({ ...defaults, ...overrides }));
}

describe("capabilitiesFor (pure)", () => {
  it("returns free caps with chatAgent off, aiSummary off", () => {
    const caps = capabilitiesFor("free");
    expect(caps.chatAgent).toBe(false);
    expect(caps.aiSummary).toBe(false);
    expect(caps.monthlyChatBudgetUsd).toBe(0);
  });

  it("returns plus caps with aiSummary on, chatAgent off", () => {
    const caps = capabilitiesFor("plus");
    expect(caps.aiSummary).toBe(true);
    expect(caps.chatAgent).toBe(false);
    expect(caps.integrations).toBe(true);
  });

  it("returns pro caps with chatAgent + mcp on", () => {
    const caps = capabilitiesFor("pro");
    expect(caps.chatAgent).toBe(true);
    expect(caps.mcpServer).toBe(true);
  });

  it("gates X features by tier: enrichment is pro-only, plus stays basic", () => {
    expect(capabilitiesFor("free").xContentEnrichment).toBe(false);
    expect(capabilitiesFor("plus").xContentEnrichment).toBe(false);
    expect(capabilitiesFor("pro").xContentEnrichment).toBe(true);

    expect(capabilitiesFor("free").xBookmarkSync).toBe(false);
    expect(capabilitiesFor("plus").xBookmarkSync).toBe(false);
    expect(capabilitiesFor("pro").xBookmarkSync).toBe(true);
  });

  // Full-matrix lock: a new capability defaulted false across every tier (the
  // failure mode that shipped enrichment disabled for Pro) can't pass silently —
  // adding or moving a cap forces a deliberate edit here.
  it("locks the full tier capability matrix", () => {
    expect(TIER_CAPABILITIES).toEqual({
      free: {
        aiSummary: false,
        chatAgent: false,
        integrations: false,
        xBookmarkSync: false,
        xContentEnrichment: false,
        publicApi: false,
        mcpServer: false,
        weeklyDigest: false,
        monthlyChatBudgetUsd: 0,
      },
      plus: {
        aiSummary: true,
        chatAgent: false,
        integrations: true,
        xBookmarkSync: false,
        xContentEnrichment: false,
        publicApi: true,
        mcpServer: false,
        weeklyDigest: true,
        monthlyChatBudgetUsd: 0,
      },
      pro: {
        aiSummary: true,
        chatAgent: true,
        integrations: true,
        xBookmarkSync: true,
        xContentEnrichment: true,
        publicApi: true,
        mcpServer: true,
        weeklyDigest: true,
        monthlyChatBudgetUsd: 5,
      },
    });
  });
});

describe("mergeCapabilities", () => {
  it("returns tier defaults when no overrides", () => {
    expect(mergeCapabilities("free", {})).toEqual(TIER_CAPABILITIES.free);
    expect(mergeCapabilities("free", null)).toEqual(TIER_CAPABILITIES.free);
    expect(mergeCapabilities("free", undefined)).toEqual(
      TIER_CAPABILITIES.free
    );
  });

  it("override flips a single cap on top of tier default", () => {
    const merged = mergeCapabilities("free", { aiSummary: true });
    expect(merged.aiSummary).toBe(true);
    expect(merged.chatAgent).toBe(false);
  });

  it("override can force-off a tier-enabled cap", () => {
    const merged = mergeCapabilities("pro", { chatAgent: false });
    expect(merged.chatAgent).toBe(false);
    expect(merged.aiSummary).toBe(true);
  });

  it("override budget replaces tier budget", () => {
    const merged = mergeCapabilities("plus", { monthlyChatBudgetUsd: 100 });
    expect(merged.monthlyChatBudgetUsd).toBe(100);
  });
});

describe("checkChatFeatureEnabled (Billing-backed)", () => {
  it.effect("succeeds when capabilities.chatAgent is true", () => {
    const layer = makeBillingLayer({
      capabilities: () => Effect.succeed(capabilitiesFor("pro")),
    });

    return checkChatFeatureEnabled(OrgId.make("org-1")).pipe(
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.Error)
    );
  });

  it.effect(
    "fails with ChatFeatureDisabledError when capabilities.chatAgent is false",
    () =>
      checkChatFeatureEnabled(OrgId.make("org-1")).pipe(
        Effect.provide(
          makeBillingLayer({
            capabilities: () => Effect.succeed(capabilitiesFor("free")),
          })
        ),
        Effect.flip,
        Logger.withMinimumLogLevel(LogLevel.Error),
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error._tag).toBe("ChatFeatureDisabledError");
            expect((error as ChatFeatureDisabledError).orgId).toBe("org-1");
          })
        )
      )
  );

  it.effect("propagates DbError from Billing.capabilities", () =>
    checkChatFeatureEnabled(OrgId.make("org-1")).pipe(
      Effect.provide(
        makeBillingLayer({
          capabilities: () =>
            Effect.fail(new DbError({ cause: new Error("D1 down") })),
        })
      ),
      Effect.flip,
      Logger.withMinimumLogLevel(LogLevel.Error),
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("DbError");
        })
      )
    )
  );

  it.effect("propagates OrgNotFoundError from Billing.capabilities", () => {
    const orgId = OrgId.make("missing");
    return checkChatFeatureEnabled(orgId).pipe(
      Effect.provide(
        makeBillingLayer({
          capabilities: () => OrgNotFoundError.make({ orgId }),
        })
      ),
      Effect.flip,
      Logger.withMinimumLogLevel(LogLevel.Error),
      Effect.tap((error) =>
        Effect.sync(() => {
          expect(error._tag).toBe("OrgNotFoundError");
        })
      )
    );
  });

  it.effect("passes the correct orgId to capabilities", () => {
    let capturedOrgId: string | null = null;

    const layer = makeBillingLayer({
      capabilities: (orgId: string) => {
        capturedOrgId = orgId;
        return Effect.succeed(capabilitiesFor("pro"));
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
