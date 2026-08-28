import { assert, describe, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { OrgId } from "../../db/branded";
import {
  DigestScheduleReconcilerLive,
  reconcileDigestSchedule,
} from "../reconcile";

describe("reconcileDigestSchedule", () => {
  it.effect("wakes the workspace owner selected by organization id", () =>
    Effect.gen(function* () {
      const ensureDigestScheduled = vi.fn().mockResolvedValue(undefined);
      const idFromName = vi.fn((name: string) => `id:${name}`);
      const get = vi.fn(() => ({ ensureDigestScheduled }));
      const env = {
        LINK_PROCESSOR_DO: { get, idFromName },
      };

      yield* reconcileDigestSchedule(OrgId.make("org-1")).pipe(
        Effect.provide(DigestScheduleReconcilerLive(env as never))
      );

      assert.deepStrictEqual(idFromName.mock.calls, [["org-1"]]);
      assert.deepStrictEqual(get.mock.calls, [["id:org-1"]]);
      assert.strictEqual(ensureDigestScheduled.mock.calls.length, 1);
    })
  );

  it.effect("maps owner RPC rejection to the typed organization error", () =>
    Effect.gen(function* () {
      const rpcError = new Error("owner unavailable");
      const env = {
        LINK_PROCESSOR_DO: {
          idFromName: (name: string) => `id:${name}`,
          get: () => ({
            ensureDigestScheduled: () => Promise.reject(rpcError),
          }),
        },
      };
      const result = yield* Effect.result(
        reconcileDigestSchedule(OrgId.make("org-1")).pipe(
          Effect.provide(DigestScheduleReconcilerLive(env as never))
        )
      );

      assert.isTrue(Result.isFailure(result));
      if (Result.isFailure(result)) {
        assert.strictEqual(result.failure._tag, "DigestScheduleReconcileError");
        assert.strictEqual(result.failure.orgId, "org-1");
        assert.strictEqual(result.failure.cause, rpcError);
      }
    })
  );
});
