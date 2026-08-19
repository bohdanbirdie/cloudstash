import { describe, expect, it } from "@effect/vitest";
import { env } from "cloudflare:test";
import { Effect } from "effect";

import { ensureMcpResource } from "../../auth/mcp-resource";
import { Billing } from "../../billing/service";
import { createDb } from "../../db";
import { runHandler } from "../../runtime";

describe("layer memoization (verification-matrix row 7)", () => {
  it.live("seeds the MCP resource concurrently without duplicates", () =>
    Effect.gen(function* () {
      const db = createDb(env.DB);
      const before = yield* Effect.promise(() =>
        env.DB.prepare("SELECT COUNT(*) AS count FROM oauth_resource").first<{
          count: number;
        }>()
      );
      expect(before?.count).toBe(0);

      yield* Effect.forEach(
        Array.from({ length: 4 }),
        () => ensureMcpResource(db, env.DB, "http://localhost/mcp"),
        { concurrency: "unbounded" }
      );

      const seeded = yield* Effect.promise(() =>
        env.DB.prepare(
          "SELECT COUNT(*) AS count FROM oauth_resource WHERE identifier = ?"
        )
          .bind("http://localhost/mcp")
          .first<{ count: number }>()
      );
      expect(seeded?.count).toBe(1);
    })
  );

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
