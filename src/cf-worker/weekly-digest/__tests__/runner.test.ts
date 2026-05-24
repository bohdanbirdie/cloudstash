import { describe, expect, it } from "@effect/vitest";
import { Effect, Either, Layer, Ref } from "effect";

import {
  DigestEventSinkError,
  DigestLinkSourceError,
  WeeklyDigestGenerateError,
} from "../errors";
import type { DigestLinkInput } from "../generator";
import { WeeklyDigestGenerator } from "../generator";
import { runDigest } from "../runner";
import type { DigestCommitParams } from "../services";
import { DigestEventSink, DigestLinkSource } from "../services";

const sampleLinks: ReadonlyArray<DigestLinkInput> = [
  {
    domain: "example.com",
    summary: "Foo bar",
    tags: ["a", "b"],
    title: "Title One",
    url: "https://example.com/one",
  },
  {
    domain: "other.com",
    summary: "Baz qux",
    tags: ["c"],
    title: "Title Two",
    url: "https://other.com/two",
  },
];

const StubLinkSourceLive = (links: ReadonlyArray<DigestLinkInput>) =>
  Layer.succeed(DigestLinkSource, {
    collect: () => Effect.succeed(links),
  });

const FailingLinkSourceLive = (error: DigestLinkSourceError) =>
  Layer.succeed(DigestLinkSource, {
    collect: () => Effect.fail(error),
  });

const RecordingSinkLive = (ref: Ref.Ref<DigestCommitParams[]>) =>
  Layer.succeed(DigestEventSink, {
    commit: (params) => Ref.update(ref, (xs) => [...xs, params]),
  });

const FailingSinkLive = (error: DigestEventSinkError) =>
  Layer.succeed(DigestEventSink, {
    commit: () => Effect.fail(error),
  });

const StubGeneratorLive = (markdown: string) =>
  Layer.succeed(
    WeeklyDigestGenerator,
    new WeeklyDigestGenerator({ generate: () => Effect.succeed(markdown) })
  );

const FailingGeneratorLive = (error: WeeklyDigestGenerateError) =>
  Layer.succeed(
    WeeklyDigestGenerator,
    new WeeklyDigestGenerator({ generate: () => Effect.fail(error) })
  );

interface BuildLayerOverrides {
  readonly source?: Layer.Layer<DigestLinkSource>;
  readonly sink?: Layer.Layer<DigestEventSink>;
  readonly generator?: Layer.Layer<WeeklyDigestGenerator>;
}

const buildLayer = (
  links: ReadonlyArray<DigestLinkInput>,
  sinkRef: Ref.Ref<DigestCommitParams[]>,
  markdown = "stub digest",
  overrides: BuildLayerOverrides = {}
) =>
  Layer.mergeAll(
    overrides.source ?? StubLinkSourceLive(links),
    overrides.sink ?? RecordingSinkLive(sinkRef),
    overrides.generator ?? StubGeneratorLive(markdown)
  );

describe("runDigest", () => {
  it.effect(
    "generates a digest, commits the event, and reports linkCount",
    () =>
      Effect.gen(function* () {
        const sinkRef = yield* Ref.make<DigestCommitParams[]>([]);
        const result = yield* runDigest({
          now: new Date("2026-05-23T12:00:00Z"),
          trigger: "manual",
        }).pipe(Effect.provide(buildLayer(sampleLinks, sinkRef, "hello")));

        expect(result.status).toBe("generated");
        if (result.status !== "generated") return;
        expect(result.linkCount).toBe(2);
        expect(result.period).toBe("2026-W21");

        const committed = yield* Ref.get(sinkRef);
        expect(committed).toHaveLength(1);
        expect(committed[0].contentMd).toBe("hello");
        expect(committed[0].period).toBe("2026-W21");
        expect(committed[0].id).toMatch(/^[A-Za-z0-9_-]+$/);
      })
  );

  it.effect(
    "skips when the link source returns no links, does not commit",
    () =>
      Effect.gen(function* () {
        const sinkRef = yield* Ref.make<DigestCommitParams[]>([]);
        const result = yield* runDigest({
          now: new Date("2026-05-23T12:00:00Z"),
          trigger: "alarm",
        }).pipe(Effect.provide(buildLayer([], sinkRef)));

        expect(result.status).toBe("skipped-empty");
        if (result.status === "skipped-empty") {
          expect(result.period).toBe("2026-W21");
        }
        const committed = yield* Ref.get(sinkRef);
        expect(committed).toHaveLength(0);
      })
  );

  it.effect("each generation produces a distinct event id", () =>
    Effect.gen(function* () {
      const sinkRef = yield* Ref.make<DigestCommitParams[]>([]);
      const layer = buildLayer(sampleLinks, sinkRef);
      yield* runDigest({
        now: new Date("2026-05-23T12:00:00Z"),
        trigger: "manual",
      }).pipe(Effect.provide(layer));
      yield* runDigest({
        now: new Date("2026-05-23T13:00:00Z"),
        trigger: "manual",
      }).pipe(Effect.provide(layer));

      const committed = yield* Ref.get(sinkRef);
      expect(committed).toHaveLength(2);
      expect(committed[0].id).not.toBe(committed[1].id);
    })
  );

  it.effect(
    "propagates link-source failure as DigestLinkSourceError, sink never commits",
    () =>
      Effect.gen(function* () {
        const sinkRef = yield* Ref.make<DigestCommitParams[]>([]);
        const failure = new DigestLinkSourceError({
          message: "query failed",
          operation: "collect",
        });
        const layer = buildLayer(sampleLinks, sinkRef, "x", {
          source: FailingLinkSourceLive(failure),
        });
        const exit = yield* runDigest({
          now: new Date("2026-05-23T12:00:00Z"),
          trigger: "manual",
        }).pipe(Effect.provide(layer), Effect.either);

        expect(Either.isLeft(exit)).toBe(true);
        if (Either.isLeft(exit) && exit.left._tag === "DigestLinkSourceError") {
          expect(exit.left.message).toBe("query failed");
          expect(exit.left.operation).toBe("collect");
        } else {
          expect.fail("expected DigestLinkSourceError");
        }
        const committed = yield* Ref.get(sinkRef);
        expect(committed).toHaveLength(0);
      })
  );

  it.effect(
    "propagates generator failure as WeeklyDigestGenerateError, sink never commits",
    () =>
      Effect.gen(function* () {
        const sinkRef = yield* Ref.make<DigestCommitParams[]>([]);
        const failure = new WeeklyDigestGenerateError({
          message: "rate limited",
          statusCode: 429,
        });
        const layer = buildLayer(sampleLinks, sinkRef, "x", {
          generator: FailingGeneratorLive(failure),
        });
        const exit = yield* runDigest({
          now: new Date("2026-05-23T12:00:00Z"),
          trigger: "manual",
        }).pipe(Effect.provide(layer), Effect.either);

        expect(Either.isLeft(exit)).toBe(true);
        if (
          Either.isLeft(exit) &&
          exit.left._tag === "WeeklyDigestGenerateError"
        ) {
          expect(exit.left.message).toBe("rate limited");
          expect(exit.left.statusCode).toBe(429);
        } else {
          expect.fail("expected WeeklyDigestGenerateError");
        }
        const committed = yield* Ref.get(sinkRef);
        expect(committed).toHaveLength(0);
      })
  );

  it.effect("propagates sink failure as DigestEventSinkError", () =>
    Effect.gen(function* () {
      const sinkRef = yield* Ref.make<DigestCommitParams[]>([]);
      const failure = new DigestEventSinkError({
        message: "store offline",
        operation: "commit",
      });
      const layer = buildLayer(sampleLinks, sinkRef, "ok", {
        sink: FailingSinkLive(failure),
      });
      const exit = yield* runDigest({
        now: new Date("2026-05-23T12:00:00Z"),
        trigger: "manual",
      }).pipe(Effect.provide(layer), Effect.either);

      expect(Either.isLeft(exit)).toBe(true);
      if (Either.isLeft(exit) && exit.left._tag === "DigestEventSinkError") {
        expect(exit.left.message).toBe("store offline");
        expect(exit.left.operation).toBe("commit");
      } else {
        expect.fail("expected DigestEventSinkError");
      }
    })
  );
});
