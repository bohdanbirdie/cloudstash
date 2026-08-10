import { env } from "cloudflare:test";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { Billing } from "../../billing/service";
import { runHandler } from "../../runtime";

describe("layer memoization (verification-matrix row 7)", () => {
  it("rebuilds services on every top-level provide of the memoized layer, never freezing per-isolate singletons", async () => {
    const captured: Array<unknown> = [];
    const probe = Effect.gen(function* () {
      captured.push(yield* Billing);
      return Response.json({ ok: true });
    });

    const first = await runHandler(env, probe);
    const second = await runHandler(env, probe);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(captured).toHaveLength(2);
    expect(captured[0]).not.toBe(captured[1]);
  });
});
