// @vitest-environment jsdom
import { it, describe, expect, beforeEach, afterEach } from "@effect/vitest";
import { Deferred, Effect, Fiber, Layer, Option, Ref } from "effect";

import {
  makeTestStore,
  silentLogger,
} from "../../../livestore/__tests__/test-helpers";
import type { TestStore } from "../../../livestore/__tests__/test-helpers";
import { events, tables } from "../../../livestore/schema";
import { LinkId } from "../../db/branded";
import { processLink } from "../../link-processor/process-link";
import {
  AiSummaryGenerator,
  ContentExtractor,
  LinkEventStore,
  MetadataFetcher,
} from "../../link-processor/services";
import type { StoreEvent } from "../../link-processor/services";
import {
  MAX_CONCURRENT_AI,
  MAX_CONCURRENT_METADATA,
} from "../../link-processor/types";
import { EnrichmentGenerator } from "../../x-enrichment/generator";
import { ThreadProvider } from "../../x-enrichment/services";
import { EnrichmentUsage } from "../../x-enrichment/usage";

const enrichmentStubs = Layer.mergeAll(
  Layer.succeed(
    ThreadProvider,
    ThreadProvider.of({
      fetchContext: () =>
        Effect.die(new Error("unexpected ThreadProvider call in test")),
    })
  ),
  Layer.succeed(
    EnrichmentGenerator,
    new EnrichmentGenerator({
      generate: () =>
        Effect.die(new Error("unexpected EnrichmentGenerator call in test")),
    })
  ),
  Layer.succeed(EnrichmentUsage, {
    current: () =>
      Effect.die(new Error("unexpected EnrichmentUsage.current call in test")),
    increment: () =>
      Effect.die(
        new Error("unexpected EnrichmentUsage.increment call in test")
      ),
  })
);

const linkA = { id: LinkId.make("link-a"), url: "https://a.example" };
const linkB = { id: LinkId.make("link-b"), url: "https://b.example" };

const mockMetadata = { title: "T", description: "D" };

let store: TestStore;

beforeEach(async () => {
  store = await makeTestStore();
  for (const link of [linkA, linkB]) {
    store.commit(
      events.linkCreatedV2({
        id: link.id,
        url: link.url,
        domain: "example",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        source: "test",
        sourceMeta: null,
      })
    );
  }
});

afterEach(async () => {
  await store.shutdownPromise?.();
});

const metadataCommitName = events.linkMetadataFetched.name;

const signalingEventStore = (signals: Map<string, Deferred.Deferred<void>>) =>
  Layer.succeed(LinkEventStore, {
    commit: (event: StoreEvent) =>
      Effect.gen(function* () {
        store.commit(event);
        if (event.name === metadataCommitName) {
          const linkId = (event.args as { linkId: string }).linkId;
          const signal = signals.get(linkId);
          if (signal) yield* Deferred.succeed(signal, undefined);
        }
      }),
    queryTags: () => Effect.succeed([]),
    queryLinkTagNames: () => Effect.succeed([]),
  });

const seedLinks = (prefix: string, count: number) => {
  const links = Array.from({ length: count }, (_, i) => ({
    id: LinkId.make(`${prefix}-${i}`),
    url: `https://${prefix}${i}.example`,
  }));
  for (const link of links) {
    store.commit(
      events.linkCreatedV2({
        id: link.id,
        url: link.url,
        domain: "example",
        createdAt: new Date("2026-01-01T00:00:00Z"),
        source: "test",
        sourceMeta: null,
      })
    );
  }
  return links;
};

describe("processLink concurrency (metadata vs AI lanes)", () => {
  it.effect(
    "a stalled AI summary does not block metadata fetching for another link",
    () =>
      Effect.gen(function* () {
        const metadataSem = yield* Effect.makeSemaphore(8);
        const aiSem = yield* Effect.makeSemaphore(1);

        const release = yield* Deferred.make<void>();
        const aiStarted = yield* Deferred.make<void>();
        const metaB = yield* Deferred.make<void>();

        const layers = Layer.mergeAll(
          Layer.succeed(MetadataFetcher, {
            fetch: () => Effect.succeed(mockMetadata),
          }),
          Layer.succeed(ContentExtractor, {
            extract: () => Effect.succeed(null),
          }),
          Layer.succeed(AiSummaryGenerator, {
            generate: () =>
              Effect.gen(function* () {
                yield* Deferred.succeed(aiStarted, undefined);
                yield* Deferred.await(release);
                return { summary: "S", suggestedTags: [] };
              }),
          }),
          signalingEventStore(new Map([[linkB.id, metaB]])),
          enrichmentStubs
        );

        const run = (link: { id: LinkId; url: string }) =>
          processLink({
            link,
            aiSummaryEnabled: true,
            metadataSemaphore: metadataSem,
            aiSemaphore: aiSem,
          }).pipe(Effect.provide(layers));

        const fiberA = yield* Effect.fork(run(linkA));
        yield* Deferred.await(aiStarted);

        const fiberB = yield* Effect.fork(run(linkB));
        yield* Deferred.await(metaB);

        expect(
          store.query(tables.linkSnapshots.where({ linkId: linkB.id }))
        ).toHaveLength(1);
        expect(
          store.query(tables.linkSummaries.where({ linkId: linkB.id }))
        ).toHaveLength(0);
        expect(
          store.query(
            tables.linkProcessingStatus.where({ linkId: linkB.id })
          )[0].status
        ).toBe("pending");

        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(fiberA);
        yield* Fiber.join(fiberB);

        expect(
          store.query(tables.linkSummaries.where({ linkId: linkA.id }))
        ).toHaveLength(1);
        expect(
          store.query(tables.linkSummaries.where({ linkId: linkB.id }))
        ).toHaveLength(1);
        expect(
          store.query(
            tables.linkProcessingStatus.where({ linkId: linkB.id })
          )[0].status
        ).toBe("completed");
      }).pipe(silentLogger)
  );

  it.effect(
    "metadata permit is released before the AI lane runs (single link)",
    () =>
      Effect.gen(function* () {
        const metadataSem = yield* Effect.makeSemaphore(1);
        const aiSem = yield* Effect.makeSemaphore(1);
        const release = yield* Deferred.make<void>();
        const aiStarted = yield* Deferred.make<void>();

        const layers = Layer.mergeAll(
          Layer.succeed(MetadataFetcher, {
            fetch: () => Effect.succeed(mockMetadata),
          }),
          Layer.succeed(ContentExtractor, {
            extract: () => Effect.succeed(null),
          }),
          Layer.succeed(AiSummaryGenerator, {
            generate: () =>
              Effect.gen(function* () {
                yield* Deferred.succeed(aiStarted, undefined);
                yield* Deferred.await(release);
                return { summary: "S", suggestedTags: [] };
              }),
          }),
          signalingEventStore(new Map()),
          enrichmentStubs
        );

        const fiber = yield* Effect.fork(
          processLink({
            link: linkA,
            aiSummaryEnabled: true,
            metadataSemaphore: metadataSem,
            aiSemaphore: aiSem,
          }).pipe(Effect.provide(layers))
        );

        yield* Deferred.await(aiStarted);
        const acquired = yield* metadataSem.withPermitsIfAvailable(1)(
          Effect.succeed(true)
        );
        expect(Option.isSome(acquired)).toBe(true);

        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(fiber);
      }).pipe(silentLogger)
  );

  it.effect(
    "the AI lane never exceeds MAX_CONCURRENT_AI concurrent summaries",
    () =>
      Effect.gen(function* () {
        const metadataSem = yield* Effect.makeSemaphore(
          MAX_CONCURRENT_METADATA
        );
        const aiSem = yield* Effect.makeSemaphore(MAX_CONCURRENT_AI);

        const release = yield* Deferred.make<void>();
        const capReached = yield* Deferred.make<void>();
        const entered = yield* Ref.make(0);

        const layers = Layer.mergeAll(
          Layer.succeed(MetadataFetcher, {
            fetch: () => Effect.succeed(mockMetadata),
          }),
          Layer.succeed(ContentExtractor, {
            extract: () => Effect.succeed(null),
          }),
          Layer.succeed(AiSummaryGenerator, {
            generate: () =>
              Effect.gen(function* () {
                const n = yield* Ref.updateAndGet(entered, (x) => x + 1);
                if (n === MAX_CONCURRENT_AI) {
                  yield* Deferred.succeed(capReached, undefined);
                }
                yield* Deferred.await(release);
                return { summary: "S", suggestedTags: [] };
              }),
          }),
          signalingEventStore(new Map()),
          enrichmentStubs
        );

        const links = seedLinks("ai-cap", MAX_CONCURRENT_AI + 2);
        const fibers = yield* Effect.forEach(links, (link) =>
          Effect.fork(
            processLink({
              link,
              aiSummaryEnabled: true,
              metadataSemaphore: metadataSem,
              aiSemaphore: aiSem,
            }).pipe(Effect.provide(layers))
          )
        );

        yield* Deferred.await(capReached);

        const extraPermit = yield* aiSem.withPermitsIfAvailable(1)(
          Effect.succeed(true)
        );
        expect(Option.isNone(extraPermit)).toBe(true);
        expect(yield* Ref.get(entered)).toBe(MAX_CONCURRENT_AI);

        yield* Deferred.succeed(release, undefined);
        yield* Fiber.joinAll(fibers);

        for (const link of links) {
          expect(
            store.query(tables.linkSummaries.where({ linkId: link.id }))
          ).toHaveLength(1);
        }
      }).pipe(silentLogger)
  );

  it.effect(
    "the metadata lane never exceeds MAX_CONCURRENT_METADATA concurrent fetches",
    () =>
      Effect.gen(function* () {
        const metadataSem = yield* Effect.makeSemaphore(
          MAX_CONCURRENT_METADATA
        );
        const aiSem = yield* Effect.makeSemaphore(MAX_CONCURRENT_AI);

        const release = yield* Deferred.make<void>();
        const capReached = yield* Deferred.make<void>();
        const entered = yield* Ref.make(0);

        const layers = Layer.mergeAll(
          Layer.succeed(MetadataFetcher, {
            fetch: () =>
              Effect.gen(function* () {
                const n = yield* Ref.updateAndGet(entered, (x) => x + 1);
                if (n === MAX_CONCURRENT_METADATA) {
                  yield* Deferred.succeed(capReached, undefined);
                }
                yield* Deferred.await(release);
                return mockMetadata;
              }),
          }),
          Layer.succeed(ContentExtractor, {
            extract: () => Effect.succeed(null),
          }),
          Layer.succeed(AiSummaryGenerator, {
            generate: () => Effect.succeed({ summary: "S", suggestedTags: [] }),
          }),
          signalingEventStore(new Map()),
          enrichmentStubs
        );

        const links = seedLinks("meta-cap", MAX_CONCURRENT_METADATA + 2);
        const fibers = yield* Effect.forEach(links, (link) =>
          Effect.fork(
            processLink({
              link,
              aiSummaryEnabled: true,
              metadataSemaphore: metadataSem,
              aiSemaphore: aiSem,
            }).pipe(Effect.provide(layers))
          )
        );

        yield* Deferred.await(capReached);

        const extraPermit = yield* metadataSem.withPermitsIfAvailable(1)(
          Effect.succeed(true)
        );
        expect(Option.isNone(extraPermit)).toBe(true);
        expect(yield* Ref.get(entered)).toBe(MAX_CONCURRENT_METADATA);

        yield* Deferred.succeed(release, undefined);
        yield* Fiber.joinAll(fibers);

        for (const link of links) {
          expect(
            store.query(tables.linkSnapshots.where({ linkId: link.id }))
          ).toHaveLength(1);
        }
      }).pipe(silentLogger)
  );
});
