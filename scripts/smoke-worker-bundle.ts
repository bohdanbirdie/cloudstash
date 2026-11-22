import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

import { localWorkerOptions } from "../tools/local-worker";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const migrationsDir = path.join(root, "drizzle/migrations");
const origin = "http://127.0.0.1:8787";

const workerDir = path.join(root, "dist/ssr");
const workerFiles = readdirSync(workerDir, { recursive: true })
  .map(String)
  .filter((file) => file.endsWith(".js") || file.endsWith(".wasm"))
  .toSorted((a, b) => (a === "index.js" ? -1 : b === "index.js" ? 1 : 0));
const workerModules = workerFiles.map((file) => ({
  type: file.endsWith(".wasm")
    ? ("CompiledWasm" as const)
    : ("ESModule" as const),
  path: path.join(workerDir, file),
}));

const tempRoot = mkdtempSync(path.join(tmpdir(), "cloudstash-bundle-smoke-"));
const mf = new Miniflare(
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
);

try {
  const db = await mf.getD1Database("DB");
  for (const { sql } of readMigrationFiles({
    migrationsFolder: migrationsDir,
  })) {
    const statements = sql
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);
    await db.batch(statements.map((statement) => db.prepare(statement)));
  }

  const signup = await mf.dispatchFetch(`${origin}/api/auth/sign-up/email`, {
    body: JSON.stringify({
      email: `bundle-smoke-${crypto.randomUUID()}@test.com`,
      name: "Bundle Smoke",
      password: "test-password-123",
    }),
    headers: { "Content-Type": "application/json", Origin: origin },
    method: "POST",
  });
  if (!signup.ok) {
    throw new Error(`Signup failed (${signup.status}): ${await signup.text()}`);
  }
  const cookie = signup.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Signup did not return a session cookie");

  const me = await mf.dispatchFetch(`${origin}/api/auth/me`, {
    headers: { Cookie: cookie },
  });
  if (!me.ok) {
    throw new Error(`/api/auth/me failed (${me.status}): ${await me.text()}`);
  }
  const body = (await me.json()) as {
    session?: { activeOrganizationId?: string };
  };
  const storeId = body.session?.activeOrganizationId;
  if (!storeId) throw new Error("Session did not contain an active workspace");

  const syncUrl = new URL("/sync", await mf.ready);
  syncUrl.protocol = "ws:";
  syncUrl.search = new URLSearchParams({ storeId, transport: "ws" }).toString();
  await new Promise<void>((resolve, reject) => {
    const socket = new WebSocket(syncUrl, {
      headers: { Cookie: cookie, Origin: origin },
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("WebSocket upgrade timed out after 15s"));
    }, 15_000);
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      socket.close();
      resolve();
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("WebSocket upgrade was rejected"));
    });
  });
  console.log(
    "ok  minified Worker smoke (D1 signup + authenticated SyncBackendDO WebSocket upgrade)"
  );
} finally {
  await mf.dispose();
  rmSync(tempRoot, { force: true, recursive: true });
}
