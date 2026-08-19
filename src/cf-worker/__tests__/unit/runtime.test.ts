import { it } from "@effect/vitest";
import { Context, Effect, Layer } from "effect";
import { expect, vi } from "vitest";

import { provideResponse } from "../../runtime";

class TestService extends Context.Service<TestService, {}>()("TestService") {}

it.effect(
  "maps layer acquisition defects through the shared response boundary",
  () => {
    const fallback = vi.fn(() =>
      Effect.succeed(Response.json({ error: "unavailable" }, { status: 503 }))
    );
    const effect = Effect.gen(function* () {
      yield* TestService;
      return Response.json({ ok: true });
    });

    return provideResponse(
      effect,
      Layer.effect(TestService, Effect.die("layer failed")),
      fallback
    ).pipe(
      Effect.tap((response) =>
        Effect.sync(() => {
          expect(response.status).toBe(503);
          expect(fallback).toHaveBeenCalledOnce();
        })
      )
    );
  }
);
