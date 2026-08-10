#!/usr/bin/env bun
/**
 * Local mock-ingest TUI — endless fake links for testing the ingest API.
 *
 *   bun scripts/mock-ingest/index.ts <API_KEY>
 *   then pick: [1] send 1  [2] burst 10  [3] burst 50  [4] burst 500  [c] custom  [q] quit
 *
 * Spins up its OWN mock content server (127.0.0.1:4321 by default) that serves a
 * unique page per id, mints fresh /page/:id URLs, and POSTs them to
 * ${CLOUDSTASH_ORIGIN}/api/ingest. Each burst reconciles against GET /api/links
 * to report how many of the burst's unique URLs actually landed (durability).
 *
 * NEVER starts/stops the cloudstash dev server — talks to the already-running app.
 *
 * Flags:
 *   --port=NNNN     mock content server port (default 4321)
 *   --concurrency=N in-flight POSTs during a burst (default 12)
 *   --burst=N       non-interactive: run one burst of N, print, exit
 *   --dry-run       use an internal echo server instead of the real app (self-test)
 *
 * Config: arg 1 = API key (required). Origin = env CLOUDSTASH_ORIGIN
 * (default http://127.0.0.1:3000).
 */

import {
  Cause,
  Config,
  Console,
  Effect,
  Result,
  Exit,
  Queue,
  Ref,
  Stream,
} from "effect";

import { IngestError, norm, reconcile, runBurst } from "./client";
import type { IngestOk } from "./client";
import { echoServer, mockServer } from "./server";
import type { RunningServer } from "./server";

const DEFAULT_ORIGIN = "http://127.0.0.1:3000";

const parseArgs = (
  argv: readonly string[]
): { positional: string[]; flags: Map<string, string | boolean> } => {
  const positional: string[] = [];
  const flags = new Map<string, string | boolean>();
  for (const a of argv) {
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq >= 0) flags.set(a.slice(2, eq), a.slice(eq + 1));
      else flags.set(a.slice(2), true);
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
};

const { positional, flags } = parseArgs(process.argv.slice(2));
const apiKey = positional[0];

if (!apiKey) {
  console.error("Usage: bun scripts/mock-ingest/index.ts <API_KEY> [--flags]");
  console.error("  --port=4321  --concurrency=12  --burst=N  --dry-run");
  process.exit(1);
}

const dryRun = flags.get("dry-run") === true;
const mockPort = Number(flags.get("port") ?? 4321);
const concurrency = Number(flags.get("concurrency") ?? 12);
const burstFlag = flags.get("burst");

const BURST_KEYS: Record<string, number> = {
  "1": 1,
  "2": 10,
  "3": 50,
  "4": 500,
};

const write = (s: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stdout.write(s);
  });

const tallyStatuses = (
  results: ReadonlyArray<Result.Result<IngestOk, IngestError>>
): string => {
  const counts = new Map<number, number>();
  for (const r of results) {
    if (Result.isFailure(r)) {
      counts.set(r.failure.status, (counts.get(r.failure.status) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return "";
  return [...counts.entries()]
    .map(([s, c]) => `${c}×${s === 0 ? "network-error" : s}`)
    .join(", ");
};

const program = Effect.gen(function* () {
  const mock = yield* mockServer(mockPort);
  yield* Console.log(
    `content server up at ${mock.origin}  (try: curl ${mock.origin}/page/1)`
  );

  let origin: string;
  if (dryRun) {
    const echo = yield* echoServer();
    yield* Console.log(
      `dry-run echo app at ${echo.origin} — no real ingest performed`
    );
    origin = echo.origin;
  } else {
    origin = yield* Config.string("CLOUDSTASH_ORIGIN").pipe(
      Config.withDefault(DEFAULT_ORIGIN)
    );
  }

  const counter = yield* Ref.make(0);
  const runNonce = Date.now().toString(36);

  const mintUrls = (n: number): Effect.Effect<string[]> =>
    Ref.getAndUpdate(counter, (c) => c + n).pipe(
      Effect.map((start) =>
        Array.from(
          { length: n },
          (_, i) => `${mock.origin}/page/${runNonce}-${start + i}`
        )
      )
    );

  const doBurst = (n: number): Effect.Effect<void> =>
    Effect.gen(function* () {
      const urls = yield* mintUrls(n);
      const targets = new Set(urls.map(norm));
      yield* Console.log(
        `\nbursting ${n} link(s) → ${origin}/api/ingest  (concurrency ${concurrency})`
      );

      const results = yield* runBurst(origin, apiKey, urls, concurrency, (p) =>
        write(
          `\r  sent ${p.sent}/${p.total}  queued-ack ${p.acked}  failed ${p.failed}    `
        )
      );
      yield* write("\n");

      const failTally = tallyStatuses(results);
      if (failTally) {
        yield* Console.log(`  POST failures: ${failTally}`);
        const sample = results.find(Result.isFailure);
        if (sample) {
          yield* Console.log(
            `  e.g. ${sample.failure.status}: ${sample.failure.body.slice(0, 120)}`
          );
        }
      }

      yield* Console.log("  reconciling durability (GET /api/links)…");
      const rec = yield* reconcile(origin, apiKey, targets, (r) =>
        write(
          `\r    landed ${r.found.size}/${r.total}  (scanned ${r.scanned} rows)    `
        )
      );
      yield* write("\n");

      if (rec.error) yield* Console.log(`  reconcile error: ${rec.error}`);
      yield* Console.log(
        `  DURABILITY: ${rec.found.size}/${rec.total} of this burst's unique URLs present on server`
      );
      if (rec.missing.length) {
        yield* Console.log(
          `  missing ${rec.missing.length}: ${rec.missing
            .slice(0, 3)
            .map((u) => u.replace(mock.origin, ""))
            .join(", ")}${rec.missing.length > 3 ? " …" : ""}`
        );
      }
    });

  const burstString = typeof burstFlag === "string" ? burstFlag : null;
  if (burstString !== null) {
    const n = Math.max(0, Math.floor(Number(burstString)) || 0);
    if (n <= 0) return yield* Console.error(`invalid --burst=${burstString}`);
    return yield* doBurst(n);
  }

  yield* interactive(origin, mock, doBurst);
});

const printMenu = (origin: string, mock: RunningServer): Effect.Effect<void> =>
  write(
    `\nmock-ingest  •  app ${origin}${dryRun ? "  (DRY RUN echo)" : ""}  •  content ${mock.origin}\n` +
      "  [1] send 1   [2] burst 10   [3] burst 50   [4] burst 500   [c] custom N   [q] quit\n> "
  );

const interactive = (
  origin: string,
  mock: RunningServer,
  doBurst: (n: number) => Effect.Effect<void>
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      return yield* Console.error(
        "stdin is not a TTY — use --burst=N for non-interactive runs (e.g. with --dry-run)."
      );
    }

    // null = menu mode; string = digits typed so far for a custom N.
    const collecting = yield* Ref.make<string | null>(null);

    const keypresses = Stream.callback<string>(
      (queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            stdin.setRawMode(true);
            stdin.resume();
            stdin.setEncoding("utf8");
            const onData = (k: string): void => {
              Queue.offerUnsafe(queue, k);
            };
            stdin.on("data", onData);
            return onData;
          }),
          (onData) =>
            Effect.sync(() => {
              stdin.off("data", onData);
              if (stdin.isTTY) stdin.setRawMode(false);
              stdin.pause();
            })
        ),
      { bufferSize: 16, strategy: "dropping" }
    );

    const handleKey = (k: string): Effect.Effect<void> =>
      Effect.gen(function* () {
        const buf = yield* Ref.get(collecting);
        if (buf !== null) {
          if (k === "\r" || k === "\n") {
            yield* write("\n");
            yield* Ref.set(collecting, null);
            const n = Math.max(0, Math.floor(Number(buf.trim())) || 0);
            if (n > 0) yield* doBurst(n);
            else yield* Console.log("  (cancelled)");
            yield* printMenu(origin, mock);
          } else if (k === "\u007f" || k === "\b") {
            if (buf.length > 0) {
              yield* Ref.set(collecting, buf.slice(0, -1));
              yield* write("\b \b");
            }
          } else if (/^[0-9]$/.test(k)) {
            yield* Ref.set(collecting, buf + k);
            yield* write(k);
          }
          return;
        }

        if (k in BURST_KEYS) {
          yield* doBurst(BURST_KEYS[k]);
          yield* printMenu(origin, mock);
        } else if (k === "c") {
          yield* Ref.set(collecting, "");
          yield* write("\n  custom N: ");
        }
      });

    yield* printMenu(origin, mock);
    yield* keypresses.pipe(
      Stream.takeWhile((k) => k !== "q" && k !== "\u0003"),
      Stream.runForEach(handleKey)
    );
  });

void Effect.runPromiseExit(
  Effect.scoped(program).pipe(
    Effect.tapDefect((cause) => Console.error(Cause.pretty(cause)))
  )
).then((exit) => {
  if (Exit.isFailure(exit)) process.exitCode = 1;
});
