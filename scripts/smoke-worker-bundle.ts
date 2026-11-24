import { BunRuntime, BunServices } from "@effect/platform-bun";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { Console, Data, Effect, FileSystem, Path } from "effect";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

import { localWorkerOptions } from "../tools/local-worker";

class SmokeFailure extends Data.TaggedError("SmokeFailure")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

const origin = "http://127.0.0.1:8787";

const attempt = <A>(message: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) => new SmokeFailure({ message, cause }),
  });

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* path.fromFileUrl(new URL("..", import.meta.url));
  const migrationsDir = path.join(root, "drizzle/migrations");
  const workerDir = path.join(root, "dist/ssr");

  const workerFiles = (yield* fs.readDirectory(workerDir, { recursive: true }))
    .filter((file) => file.endsWith(".js") || file.endsWith(".wasm"))
    .toSorted((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
  const workerModules = workerFiles.map((file) => ({
    type: file.endsWith(".wasm")
      ? ("CompiledWasm" as const)
      : ("ESModule" as const),
    path: path.join(workerDir, file),
  }));

  const tempRoot = yield* fs.makeTempDirectoryScoped({
    prefix: "cloudstash-bundle-smoke-",
  });
  const mf = yield* Effect.acquireRelease(
    Effect.sync(
      () =>
        new Miniflare(
          convertV4MiniflareOptions({
            ...localWorkerOptions(path.join(root, "dist/client")),
            modules: workerModules,
            modulesRoot: workerDir,
            defaultPersistRoot: tempRoot,
            bindings: {
              ...localWorkerOptions("").bindings,
              BETTER_AUTH_SECRET: "test-secret-for-bundle-smoke-32chars",
              BETTER_AUTH_URL: origin,
              ENABLE_TEST_AUTH: "true",
              GOOGLE_CLIENT_ID: "test-google-client-id",
              GOOGLE_CLIENT_SECRET: "test-google-client-secret",
              RESEND_API_KEY: "re_test_dummy",
            },
          })
        )
    ),
    (miniflare) => Effect.promise(() => miniflare.dispose())
  );

  const db = yield* attempt("Could not open the D1 database", () =>
    mf.getD1Database("DB")
  );
  for (const { sql } of readMigrationFiles({
    migrationsFolder: migrationsDir,
  })) {
    const statements = sql
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    yield* attempt("Migration failed", () =>
      db.batch(statements.map((statement) => db.prepare(statement)))
    );
  }

  const signup = yield* attempt("Signup request failed", () =>
    mf.dispatchFetch(`${origin}/api/auth/sign-up/email`, {
      body: JSON.stringify({
        email: `bundle-smoke-${crypto.randomUUID()}@test.com`,
        name: "Bundle Smoke",
        password: "test-password-123",
      }),
      headers: { "Content-Type": "application/json", Origin: origin },
      method: "POST",
    })
  );
  if (!signup.ok) {
    const text = yield* attempt("Signup failed", () => signup.text());
    return yield* new SmokeFailure({
      message: `Signup failed (${signup.status}): ${text}`,
    });
  }
  const cookie = signup.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) {
    return yield* new SmokeFailure({
      message: "Signup did not return a session cookie",
    });
  }

  const me = yield* attempt("/api/auth/me request failed", () =>
    mf.dispatchFetch(`${origin}/api/auth/me`, {
      headers: { Cookie: cookie },
    })
  );
  if (!me.ok) {
    const text = yield* attempt("/api/auth/me failed", () => me.text());
    return yield* new SmokeFailure({
      message: `/api/auth/me failed (${me.status}): ${text}`,
    });
  }
  const body = yield* attempt(
    "/api/auth/me returned invalid JSON",
    (): Promise<{ session?: { activeOrganizationId?: string } }> => me.json()
  );
  const storeId = body.session?.activeOrganizationId;
  if (!storeId) {
    return yield* new SmokeFailure({
      message: "Session did not contain an active workspace",
    });
  }

  const syncUrl = new URL(
    "/sync",
    yield* attempt("Miniflare did not start", () => mf.ready)
  );
  syncUrl.protocol = "ws:";
  syncUrl.search = new URLSearchParams({ storeId, transport: "ws" }).toString();
  yield* Effect.callback<void, SmokeFailure>((resume) => {
    const socket = new WebSocket(syncUrl, {
      headers: { Cookie: cookie, Origin: origin },
    });
    socket.addEventListener("open", () => {
      socket.close();
      resume(Effect.void);
    });
    socket.addEventListener("error", () => {
      resume(
        Effect.fail(
          new SmokeFailure({ message: "WebSocket upgrade was rejected" })
        )
      );
    });
    return Effect.sync(() => socket.close());
  }).pipe(
    Effect.timeoutOrElse({
      duration: "15 seconds",
      orElse: () =>
        Effect.fail(
          new SmokeFailure({
            message: "WebSocket upgrade timed out after 15s",
          })
        ),
    })
  );
  yield* Console.log(
    "ok  minified Worker smoke (D1 signup + authenticated SyncBackendDO WebSocket upgrade)"
  );
});

BunRuntime.runMain(
  program.pipe(Effect.scoped, Effect.provide(BunServices.layer))
);
