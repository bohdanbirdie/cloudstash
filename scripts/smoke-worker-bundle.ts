import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const wrangler = path.join(root, "node_modules/.bin/wrangler");
const workerConfig = path.join(root, "dist/cloudstash/wrangler.json");

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const availablePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local port"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });

const websocketUpgrade = (
  port: number,
  pathname: string,
  cookie: string,
  origin: string
): Promise<void> =>
  new Promise((resolve, reject) => {
    const req = request({
      headers: {
        Connection: "Upgrade",
        Cookie: cookie,
        Origin: origin,
        "Sec-WebSocket-Key": Buffer.from(crypto.randomUUID()).toString(
          "base64"
        ),
        "Sec-WebSocket-Version": "13",
        Upgrade: "websocket",
      },
      host: "127.0.0.1",
      method: "GET",
      path: pathname,
      port,
    });

    req.setTimeout(15_000, () => {
      req.destroy(new Error("WebSocket upgrade timed out"));
    });
    req.on("upgrade", (response, socket) => {
      socket.destroy();
      if (response.statusCode === 101) resolve();
      else
        reject(new Error(`Expected WebSocket 101, got ${response.statusCode}`));
    });
    req.on("response", (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        reject(
          new Error(
            `Expected WebSocket upgrade, got ${response.statusCode}: ${Buffer.concat(chunks).toString("utf8")}`
          )
        );
      });
    });
    req.on("error", reject);
    req.end();
  });

const tempRoot = mkdtempSync(path.join(tmpdir(), "cloudstash-bundle-smoke-"));
const persistDir = path.join(tempRoot, "state");
const envFile = path.join(tempRoot, "smoke.env");
let dev: ReturnType<typeof spawn> | undefined;

try {
  const port = await availablePort();
  const inspectorPort = await availablePort();
  const origin = `http://127.0.0.1:${port}`;
  writeFileSync(
    envFile,
    [
      "BETTER_AUTH_SECRET=test-secret-for-bundle-smoke-32chars",
      `BETTER_AUTH_URL=${origin}`,
      "ENABLE_TEST_AUTH=true",
      "GOOGLE_CLIENT_ID=test-google-client-id",
      "GOOGLE_CLIENT_SECRET=test-google-client-secret",
      "RESEND_API_KEY=re_test_dummy",
      "EMAIL_FROM=test@example.com",
      "",
    ].join("\n")
  );

  const migration = spawnSync(
    wrangler,
    [
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--config",
      workerConfig,
      "--persist-to",
      persistDir,
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, CI: "true" },
    }
  );
  if (migration.status !== 0) {
    throw new Error(
      `D1 migration failed:\n${migration.stdout}\n${migration.stderr}`
    );
  }

  const logs: string[] = [];
  dev = spawn(
    wrangler,
    [
      "dev",
      "--local",
      "--config",
      workerConfig,
      "--persist-to",
      persistDir,
      "--env-file",
      envFile,
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--inspector-port",
      String(inspectorPort),
      "--log-level",
      "warn",
    ],
    { cwd: root, env: { ...process.env, CI: "true" } }
  );
  const collect = (chunk: Buffer): void => {
    logs.push(chunk.toString("utf8"));
    if (logs.length > 200) logs.shift();
  };
  dev.stdout?.on("data", collect);
  dev.stderr?.on("data", collect);

  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (dev.exitCode !== null) break;
    try {
      await fetch(`${origin}/api/auth/me`);
      ready = true;
      break;
    } catch {
      await delay(250);
    }
  }
  if (!ready) {
    throw new Error(`Worker did not start:\n${logs.join("")}`);
  }

  const signup = await fetch(`${origin}/api/auth/sign-up/email`, {
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

  const me = await fetch(`${origin}/api/auth/me`, {
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

  const syncPath = `/sync?${new URLSearchParams({ storeId, transport: "ws" })}`;
  await websocketUpgrade(port, syncPath, cookie, origin);
  console.log(
    "ok  minified Worker smoke (D1 signup + authenticated SyncBackendDO WebSocket upgrade)"
  );
} finally {
  if (dev && dev.exitCode === null) {
    dev.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolve) => dev?.once("exit", () => resolve())),
      delay(5_000),
    ]);
    if (dev.exitCode === null) dev.kill("SIGKILL");
  }
  rmSync(tempRoot, { force: true, recursive: true });
}
