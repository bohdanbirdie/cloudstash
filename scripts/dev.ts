// Starts the local dev server so any number of worktrees can run at once.
// It takes the first free port from 3000 up, starts a local stand-in for
// Google (vercel-labs/emulate) with two test accounts, one whose library gets
// the test links and one that stays empty (tools/dev-seed/accounts.ts), and
// runs `alchemy dev` against both. Sign-in goes through the same OAuth flow as
// production, against the stand-in instead of Google.
//
//   bun run dev                    # free port, local Google
//   DEV_GOOGLE=real bun run dev    # real Google, which only accepts port 3000
//   PORT=3005 bun run dev          # a fixed port
//
// The server's address is written to .alchemy/dev-url while it runs, so
// apps/native/scripts/run.sh finds this worktree's server.
import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";

import { createEmulator } from "emulate";

import { EMPTY_ACCOUNT, SEEDED_ACCOUNT } from "../tools/dev-seed/accounts";

const URL_FILE = ".alchemy/dev-url";

const listens = (port: number, host: string) =>
  new Promise<boolean>((resolve) => {
    const server = createServer();
    server.once("error", (error: NodeJS.ErrnoException) =>
      resolve(error.code === "EADDRNOTAVAIL")
    );
    server.listen(port, host, () => server.close(() => resolve(true)));
  });

const isFree = async (port: number) =>
  (await listens(port, "127.0.0.1")) && (await listens(port, "::1"));

const freePort = async (from: number) => {
  for (let port = from; port < from + 100; port++) {
    if (await isFree(port)) return port;
  }
  throw new Error(`No free port between ${from} and ${from + 99}`);
};

const realGoogle = process.env.DEV_GOOGLE === "real";
const port = process.env.PORT
  ? Number(process.env.PORT)
  : realGoogle
    ? 3000
    : await freePort(3000);
const origin = `http://127.0.0.1:${port}`;

const google = realGoogle
  ? undefined
  : await createEmulator({
      service: "google",
      port: 0,
      seed: {
        google: { users: [{ ...EMPTY_ACCOUNT, email_verified: true }] },
      },
    });

mkdirSync(".alchemy", { recursive: true });
writeFileSync(URL_FILE, `${origin}\n`);
console.log(
  google
    ? `Dev server: ${origin} (sign-in: local Google, ${SEEDED_ACCOUNT} with the test links or ${EMPTY_ACCOUNT.email} empty)`
    : `Dev server: ${origin} (sign-in: real Google)`
);

const child = spawn("alchemy", ["dev", ...process.argv.slice(2)], {
  env: {
    ...process.env,
    PORT: String(port),
    ...(google ? { GOOGLE_EMULATOR_URL: google.url } : {}),
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", async (code, signal) => {
  rmSync(URL_FILE, { force: true });
  await google?.close();
  process.exit(code ?? (signal ? 1 : 0));
});
