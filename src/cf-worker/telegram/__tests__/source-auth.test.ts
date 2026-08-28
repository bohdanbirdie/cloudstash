import { assert, describe, it } from "@effect/vitest";
import { Effect, Option, Result } from "effect";

import { capabilitiesFor } from "@/lib/plan";

import type { WorkspaceAccess } from "../../auth/workspace-access";
import type { Billing } from "../../billing/service";
import { ApiKey, OrgId, UserId } from "../../db/branded";
import { makeTelegramSourceAuth } from "../services/source-auth.live";

const authorization = {
  orgId: OrgId.make("org-1"),
  userId: UserId.make("user-1"),
};

describe("Telegram source authorization", () => {
  it.effect("rechecks integrations for messages and connections", () =>
    Effect.gen(function* () {
      let enabled = true;
      const workspaceAccess = {
        authorizeApiKey: () => Effect.succeed(authorization),
      } as unknown as WorkspaceAccess["Service"];
      const billing = {
        capabilities: () =>
          Effect.succeed(
            enabled ? capabilitiesFor("plus") : capabilitiesFor("free")
          ),
      } as unknown as Billing["Service"];
      const sourceAuth = makeTelegramSourceAuth({
        billing,
        readKey: Effect.succeed(Option.some(ApiKey.make("telegram-key"))),
        workspaceAccess,
      });

      assert.deepStrictEqual(yield* sourceAuth.authenticate(), authorization);

      enabled = false;
      const [messageDenied, connectionDenied] = yield* Effect.all([
        Effect.result(sourceAuth.authenticate()),
        Effect.result(sourceAuth.verify("telegram-key")),
      ]);
      for (const denied of [messageDenied, connectionDenied]) {
        assert.isTrue(Result.isFailure(denied));
        if (Result.isFailure(denied)) {
          assert.strictEqual(denied.failure._tag, "CapabilityDisabledError");
          if (denied.failure._tag === "CapabilityDisabledError") {
            assert.strictEqual(denied.failure.capability, "integrations");
            assert.strictEqual(denied.failure.requiredTier, "plus");
          }
        }
      }
    })
  );
});
