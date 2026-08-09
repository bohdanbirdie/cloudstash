/**
 * Effect client for the cloudstash public ingest path, plus the burst and
 * reconciliation programs. Pure HTTP — no knowledge of the mock content server.
 */

import { Effect, Either, Ref, Schema } from "effect";

export const norm = (u: string): string => u.replace(/\/+$/, "");

const bearer = (apiKey: string): Record<string, string> => ({
  Authorization: `Bearer ${apiKey}`,
});

export class IngestError extends Schema.TaggedError<IngestError>()(
  "IngestError",
  {
    url: Schema.String,
    status: Schema.Number, // 0 = network/transport error
    body: Schema.String,
  }
) {}

export class LinksError extends Schema.TaggedError<LinksError>()("LinksError", {
  status: Schema.Number, // 0 = network/transport error
  body: Schema.String,
}) {}

export interface IngestOk {
  url: string;
  status: number;
}

const LinksPageSchema = Schema.Struct({
  links: Schema.Array(Schema.Struct({ url: Schema.String })),
  total: Schema.Number,
  nextCursor: Schema.NullOr(Schema.String),
});
type LinksPage = typeof LinksPageSchema.Type;

export const ingest = (
  origin: string,
  apiKey: string,
  url: string
): Effect.Effect<IngestOk, IngestError> =>
  Effect.gen(function* () {
    const res = yield* Effect.tryPromise({
      try: () =>
        fetch(`${origin}/api/ingest`, {
          method: "POST",
          headers: { ...bearer(apiKey), "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        }),
      catch: (cause) =>
        new IngestError({ url, status: 0, body: String(cause) }),
    });
    if (!res.ok) {
      const body = yield* Effect.tryPromise(() => res.text()).pipe(
        Effect.orElseSucceed(() => "")
      );
      return yield* new IngestError({ url, status: res.status, body });
    }
    return { url, status: res.status };
  });

const listLinks = (
  origin: string,
  apiKey: string,
  cursor: string | null
): Effect.Effect<LinksPage, LinksError> =>
  Effect.gen(function* () {
    const u = new URL(`${origin}/api/links`);
    u.searchParams.set("state", "all");
    u.searchParams.set("limit", "100");
    if (cursor) u.searchParams.set("cursor", cursor);

    const res = yield* Effect.tryPromise({
      try: () => fetch(u, { headers: bearer(apiKey) }),
      catch: (cause) => new LinksError({ status: 0, body: String(cause) }),
    });
    if (!res.ok) {
      const body = yield* Effect.tryPromise(() => res.text()).pipe(
        Effect.orElseSucceed(() => "")
      );
      return yield* new LinksError({ status: res.status, body });
    }
    const json = yield* Effect.tryPromise({
      try: () => res.json(),
      catch: (cause) =>
        new LinksError({ status: res.status, body: String(cause) }),
    });
    return yield* Schema.decodeUnknownEffect(LinksPageSchema)(json).pipe(
      Effect.mapError(
        (e) => new LinksError({ status: res.status, body: String(e) })
      )
    );
  });

export interface BurstProgress {
  sent: number;
  acked: number;
  failed: number;
  total: number;
}

/** POST every url with bounded concurrency, reporting progress as it lands. */
export const runBurst = (
  origin: string,
  apiKey: string,
  urls: readonly string[],
  concurrency: number,
  onProgress: (p: BurstProgress) => Effect.Effect<void>
): Effect.Effect<ReadonlyArray<Either.Either<IngestOk, IngestError>>> =>
  Effect.gen(function* () {
    const progress = yield* Ref.make<BurstProgress>({
      sent: 0,
      acked: 0,
      failed: 0,
      total: urls.length,
    });
    return yield* Effect.forEach(
      urls,
      (url) =>
        Effect.either(ingest(origin, apiKey, url)).pipe(
          Effect.tap((result) =>
            Ref.updateAndGet(progress, (p) => ({
              ...p,
              sent: p.sent + 1,
              acked: p.acked + (Either.isRight(result) ? 1 : 0),
              failed: p.failed + (Either.isLeft(result) ? 1 : 0),
            })).pipe(Effect.flatMap(onProgress))
          )
        ),
      { concurrency }
    );
  });

export interface Reconciliation {
  found: Set<string>;
  missing: string[];
  scanned: number;
  total: number;
  error?: string;
}

/** One pass over GET /api/links, paginating until every target is seen. */
const reconcileOnce = (
  origin: string,
  apiKey: string,
  targets: ReadonlySet<string>
): Effect.Effect<Reconciliation> =>
  Effect.gen(function* () {
    const found = new Set<string>();
    let cursor: string | null = null;
    let scanned = 0;
    const summarize = (error?: string): Reconciliation => ({
      found,
      missing: [...targets].filter((t) => !found.has(t)),
      scanned,
      total: targets.size,
      error,
    });

    for (let page = 0; page < 500; page++) {
      const result = yield* Effect.either(listLinks(origin, apiKey, cursor));
      if (Either.isLeft(result)) {
        return summarize(`${result.left.status} ${result.left.body}`);
      }
      const data = result.right;
      for (const l of data.links) {
        scanned++;
        const n = norm(l.url);
        if (targets.has(n)) found.add(n);
      }
      if (found.size === targets.size) break;
      cursor = data.nextCursor;
      if (!cursor) break;
    }
    return summarize();
  });

/** Poll reconcileOnce until all targets land or the deadline passes. */
export const reconcile = (
  origin: string,
  apiKey: string,
  targets: ReadonlySet<string>,
  onProgress: (r: Reconciliation) => Effect.Effect<void>,
  timeoutMs = 30_000
): Effect.Effect<Reconciliation> =>
  Effect.gen(function* () {
    const deadline = Date.now() + timeoutMs;
    let last = yield* reconcileOnce(origin, apiKey, targets);
    yield* onProgress(last);
    while (
      last.found.size < targets.size &&
      !last.error &&
      Date.now() < deadline
    ) {
      yield* Effect.sleep("2 seconds");
      last = yield* reconcileOnce(origin, apiKey, targets);
      yield* onProgress(last);
    }
    return last;
  });
