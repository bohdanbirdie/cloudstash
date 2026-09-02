import { describe, it } from "@effect/vitest";
import { Effect } from "effect";
import { expect } from "vitest";

import { OrgId } from "../../db/branded";
import {
  ExternalCallAllowance,
  reserveExternalCallForAllowance,
} from "../external-call-meter";

const ORG_ID = OrgId.make("11111111-1111-4111-8111-111111111111");
const ALLOWANCE = ExternalCallAllowance.make({
  limit: 10,
  resetsAt: "2026-09-01T00:00:00.000Z",
  usageWindowId: "window-1",
});

describe("reserveExternalCallForAllowance", () => {
  it.effect("fails closed when the Durable Object returns malformed data", () =>
    Effect.gen(function* () {
      const env = {
        LINK_PROCESSOR_DO: {
          get: () => ({ reserveExternalCall: () => Promise.resolve({}) }),
          idFromName: () => ({}) as DurableObjectId,
        },
      };

      const error = yield* Effect.flip(
        reserveExternalCallForAllowance(env as never, ORG_ID, ALLOWANCE)
      );

      expect(error).toMatchObject({ _tag: "ExternalCallMeterError" });
    })
  );
});
