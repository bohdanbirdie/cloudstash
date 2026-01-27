import { Effect } from "effect";
import { type Context } from "grammy";

import { createAuth } from "../auth";
import { createDb } from "../db";
import { logSync } from "../logger";
import { type Env } from "../shared";
import {
  InvalidApiKeyError,
  MissingApiKeyError,
  MissingChatIdError,
  MissingOrgIdError,
  NotConnectedError,
  RateLimitError,
} from "./errors";

const logger = logSync("Telegram");

type Auth = ReturnType<typeof createAuth>;

const getChatId = (ctx: Context) =>
  ctx.chat?.id
    ? Effect.succeed(ctx.chat.id)
    : Effect.fail(new MissingChatIdError({}));

const verifyApiKey = (auth: Auth, apiKey: string) =>
  Effect.gen(function* verifyApiKey() {
    const result = yield* Effect.tryPromise({
      catch: (error) => {
        const message = String(error);
        if (message.includes("Rate limit")) {
          return new RateLimitError({});
        }
        return new InvalidApiKeyError({});
      },
      try: () => auth.api.verifyApiKey({ body: { key: apiKey } }),
    });
    if (!result.valid || !result.key) {
      return yield* Effect.fail(new InvalidApiKeyError({}));
    }
    if (!result.key.metadata?.orgId) {
      return yield* Effect.fail(new MissingOrgIdError({}));
    }
    return result.key;
  });

const connectRequest = (ctx: Context, env: Env) =>
  Effect.gen(function* connectRequest() {
    const chatId = yield* getChatId(ctx);
    const apiKey = ctx.message?.text?.split(" ")[1]?.trim();
    if (!apiKey) {
      return yield* Effect.fail(new MissingApiKeyError({}));
    }

    const auth = createAuth(env, createDb(env.DB));
    yield* verifyApiKey(auth, apiKey);
    yield* Effect.promise(() =>
      env.TELEGRAM_KV.put(`telegram:${chatId}`, apiKey)
    );

    return "Connected! Send me any link to save it.";
  });

export const handleConnect = (ctx: Context, env: Env): Promise<void> => {
  logger.info("/connect", { chatId: ctx.chat?.id, from: ctx.from?.username });

  const reply = (msg: string) => Effect.promise(() => ctx.reply(msg));

  return Effect.runPromise(
    connectRequest(ctx, env).pipe(
      Effect.flatMap(reply),
      Effect.catchTags({
        InvalidApiKeyError: () => reply("Invalid or expired API key."),
        MissingApiKeyError: () => reply("Usage: /connect <api-key>"),
        MissingChatIdError: () => reply("Could not determine chat ID."),
        MissingOrgIdError: () =>
          reply(
            "API key missing orgId. Please generate a new key from the web app."
          ),
      }),
      Effect.catchAll((error) =>
        Effect.sync(() =>
          logger.error("Connect error", { error: String(error) })
        ).pipe(
          Effect.flatMap(() =>
            reply("Failed to verify API key. Please try again.")
          )
        )
      ),
      Effect.asVoid
    )
  );
};

const disconnectRequest = (ctx: Context, env: Env) =>
  Effect.gen(function* disconnectRequest() {
    const chatId = yield* getChatId(ctx);
    yield* Effect.promise(() => env.TELEGRAM_KV.delete(`telegram:${chatId}`));
    return "Disconnected. Use /connect <api-key> to reconnect.";
  });

export const handleDisconnect = (ctx: Context, env: Env): Promise<void> => {
  logger.info("/disconnect", {
    chatId: ctx.chat?.id,
    from: ctx.from?.username,
  });

  const reply = (msg: string) => Effect.promise(() => ctx.reply(msg));

  return Effect.runPromise(
    disconnectRequest(ctx, env).pipe(
      Effect.flatMap(reply),
      Effect.catchTag("MissingChatIdError", () =>
        reply("Could not determine chat ID.")
      ),
      Effect.asVoid
    )
  );
};

type IngestResult =
  | { url: string; status: "ingested" }
  | { url: string; status: "duplicate" }
  | { url: string; status: "failed"; error: string };

const ingestUrl = (
  url: string,
  storeId: string,
  env: Env
): Effect.Effect<IngestResult> =>
  Effect.gen(function* ingestUrl() {
    const doId = env.LINK_PROCESSOR_DO.idFromName(storeId);
    const stub = env.LINK_PROCESSOR_DO.get(doId);

    const doUrl = new URL("https://do/");
    doUrl.searchParams.set("storeId", storeId);
    doUrl.searchParams.set("ingest", url);

    const response = yield* Effect.tryPromise(() =>
      stub.fetch(doUrl.toString())
    );
    const result = yield* Effect.tryPromise(
      () => response.json() as Promise<{ status: string; error?: string }>
    );

    if (!response.ok) {
      return {
        error: result.error || "Unknown error",
        status: "failed",
        url,
      } as const;
    }

    if (result.status === "duplicate") {
      return { status: "duplicate", url } as const;
    }

    return { status: "ingested", url } as const;
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed({ error: String(error), status: "failed", url } as const)
    )
  );

const react = (ctx: Context, emoji: "🤔" | "👍" | "👎") =>
  Effect.tryPromise(() => ctx.react(emoji)).pipe(
    Effect.catchAll(() => Effect.void)
  );

const linksRequest = (ctx: Context, urls: string[], env: Env) =>
  Effect.gen(function* linksRequest() {
    const chatId = yield* getChatId(ctx);
    const apiKey = yield* Effect.promise(() =>
      env.TELEGRAM_KV.get(`telegram:${chatId}`)
    ).pipe(
      Effect.flatMap((key) =>
        key ? Effect.succeed(key) : Effect.fail(new NotConnectedError({}))
      )
    );

    const auth = createAuth(env, createDb(env.DB));
    const key = yield* verifyApiKey(auth, apiKey);
    const storeId = key.metadata?.orgId as string;

    yield* react(ctx, "🤔");
    const results = yield* Effect.all(
      urls.map((url) => ingestUrl(url, storeId, env))
    );

    const ingested = results.filter(
      (r): r is IngestResult & { status: "ingested" } => r.status === "ingested"
    );
    const duplicates = results.filter(
      (r): r is IngestResult & { status: "duplicate" } =>
        r.status === "duplicate"
    );
    const failed = results.filter(
      (r): r is IngestResult & { status: "failed" } => r.status === "failed"
    );

    yield* Effect.sync(() =>
      logger.info("Ingest complete", {
        chatId,
        duplicates: duplicates.length,
        failed: failed.length,
        ingested: ingested.length,
      })
    );

    if (failed.length > 0) {
      yield* react(ctx, "👎");
    } else if (duplicates.length === results.length) {
      // All were duplicates - no reaction, just inform
    } else {
      yield* react(ctx, "👍");
    }

    // Report duplicates and failures
    const messages: string[] = [];
    if (duplicates.length > 0) {
      messages.push(
        `Already saved: ${duplicates.map((r) => r.url).join(", ")}`
      );
    }
    if (failed.length > 0) {
      const failedList = failed.map((r) => `- ${r.url}: ${r.error}`).join("\n");
      messages.push(`Failed to save ${failed.length} link(s):\n${failedList}`);
    }
    if (messages.length > 0) {
      yield* Effect.promise(() => ctx.reply(messages.join("\n\n")));
    }
  });

const reply = (ctx: Context, message: string) =>
  Effect.promise(() =>
    ctx.reply(message, {
      reply_parameters: ctx.msg?.message_id
        ? { message_id: ctx.msg.message_id }
        : undefined,
    })
  ).pipe(
    Effect.asVoid,
    Effect.catchAll(() => Effect.void)
  );

export const handleLinks = (
  ctx: Context,
  urls: string[],
  env: Env
): Promise<void> => {
  logger.info("Link received", {
    chatId: ctx.chat?.id,
    from: ctx.from?.username,
    urls,
  });

  return Effect.runPromise(
    linksRequest(ctx, urls, env).pipe(
      Effect.catchTag("NotConnectedError", () =>
        reply(ctx, "Please connect first: /connect <api-key>")
      ),
      Effect.catchTag("InvalidApiKeyError", () =>
        react(ctx, "👎").pipe(
          Effect.flatMap(() =>
            reply(
              ctx,
              "Your API key is no longer valid. Please reconnect: /connect <new-api-key>"
            )
          )
        )
      ),
      Effect.catchTag("RateLimitError", () =>
        react(ctx, "👎").pipe(
          Effect.flatMap(() =>
            reply(ctx, "Too many links today. Please try again tomorrow.")
          )
        )
      ),
      Effect.catchTag("MissingChatIdError", () => Effect.void),
      Effect.catchAll((error) => {
        logger.error("Unhandled error in handleLinks", {
          error: String(error),
        });
        return Effect.void;
      })
    )
  );
};

export const extractUrls = (ctx: Context): string[] => {
  const { message } = ctx;
  if (!message?.text || !message?.entities) {
    return [];
  }

  return message.entities
    .filter((e) => e.type === "url" || e.type === "text_link")
    .map((e) =>
      e.type === "text_link" && e.url
        ? e.url
        : message.text!.slice(e.offset, e.offset + e.length)
    );
};
