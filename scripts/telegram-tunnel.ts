import { BunRuntime, BunServices } from "@effect/platform-bun";
import {
  Console,
  Data,
  Effect,
  FileSystem,
  Ref,
  Runtime,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

class MissingTelegramSecrets extends Data.TaggedError(
  "MissingTelegramSecrets"
) {
  readonly [Runtime.errorReported] = false;
}

class WebhookRegistrationError extends Data.TaggedError(
  "WebhookRegistrationError"
)<{ readonly cause: unknown }> {}

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const vars: Record<string, string> = {};
  for (const line of (yield* fs.readFileString(".env")).split("\n")) {
    if (line && !line.startsWith("#")) {
      const [key, ...rest] = line.split("=");
      vars[key.trim()] = rest.join("=").trim();
    }
  }

  const token = vars.TELEGRAM_BOT_TOKEN;
  const secret = vars.TELEGRAM_WEBHOOK_SECRET;

  if (!token || !secret) {
    yield* Console.error(
      "Missing TELEGRAM_BOT_TOKEN or TELEGRAM_WEBHOOK_SECRET in .env"
    );
    return yield* new MissingTelegramSecrets();
  }

  const proc = yield* spawner.spawn(
    ChildProcess.make(
      "bunx",
      ["cloudflared", "tunnel", "--url", "http://localhost:3000"],
      { stderr: "pipe", stdout: "pipe" }
    )
  );

  const registered = yield* Ref.make(false);

  const registerWebhook = Effect.fn("registerWebhook")(function* (
    tunnelUrl: string
  ) {
    if (yield* Ref.getAndSet(registered, true)) return;

    yield* Console.log(`\n==> Tunnel: ${tunnelUrl}`);
    yield* Console.log("==> Waiting 5s for DNS propagation...");
    yield* Effect.sleep("5 seconds");

    yield* Console.log("==> Registering webhook...");
    const result = yield* Effect.tryPromise({
      try: async () => {
        const response = await fetch(
          `https://api.telegram.org/bot${token}/setWebhook`,
          {
            body: JSON.stringify({
              secret_token: secret,
              url: `${tunnelUrl}/api/telegram`,
            }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
          }
        );
        return response.json();
      },
      catch: (cause) => new WebhookRegistrationError({ cause }),
    });
    yield* Console.log("==> Result:", JSON.stringify(result));
    yield* Console.log("");
  });

  const processStream = (stream: typeof proc.stdout) =>
    stream.pipe(
      Stream.decodeText(),
      Stream.runForEach((text) => {
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match) {
          return registerWebhook(match[0]).pipe(
            Effect.catchTag("WebhookRegistrationError", (error) =>
              Console.error("Webhook registration failed:", error.cause)
            ),
            Effect.forkScoped,
            Effect.asVoid
          );
        }
        if (text.includes("ERR") || text.includes("error")) {
          return Effect.sync(() => process.stderr.write(text));
        }
        return Effect.void;
      }),
      Effect.catchTag("PlatformError", (error) =>
        Console.error("Stream processing failed:", error)
      ),
      Effect.forkScoped
    );

  yield* processStream(proc.stderr);
  yield* processStream(proc.stdout);

  yield* proc.exitCode;
});

BunRuntime.runMain(
  program.pipe(Effect.scoped, Effect.provide(BunServices.layer))
);
