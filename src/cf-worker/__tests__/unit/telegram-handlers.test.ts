import { Effect, Layer, LogLevel, Logger } from "effect";
import { describe, expect, it } from "vitest";

import {
  InvalidApiKeyError,
  MissingOrgIdError,
  NotConnectedError,
  QueueSendError,
  RateLimitError,
} from "../../telegram/errors";
import {
  handleConnect,
  handleDisconnect,
  handleLinks,
} from "../../telegram/handlers";
import {
  LinkQueue,
  Messenger,
  SourceAuth,
  TelegramKeyStore,
} from "../../telegram/services";

function createTestMessenger() {
  const drafts: string[] = [];
  const replies: string[] = [];
  const layer = Layer.succeed(Messenger, {
    draft: (text) =>
      Effect.sync(() => {
        drafts.push(text);
      }),
    reply: (text) =>
      Effect.sync(() => {
        replies.push(text);
      }),
  });
  return { layer, drafts, replies };
}

function createTestSourceAuth(
  result:
    | { orgId: string }
    | "not-connected"
    | "invalid-key"
    | "rate-limit"
    | "missing-org-id"
) {
  return Layer.succeed(SourceAuth, {
    authenticate: () => {
      if (result === "not-connected")
        return Effect.fail(new NotConnectedError({}));
      if (result === "invalid-key")
        return Effect.fail(new InvalidApiKeyError({}));
      if (result === "rate-limit") return Effect.fail(new RateLimitError({}));
      if (result === "missing-org-id")
        return Effect.fail(new MissingOrgIdError({}));
      return Effect.succeed(result);
    },
    verify: (_apiKey) => {
      if (result === "invalid-key")
        return Effect.fail(new InvalidApiKeyError({}));
      if (result === "rate-limit") return Effect.fail(new RateLimitError({}));
      if (result === "missing-org-id")
        return Effect.fail(new MissingOrgIdError({}));
      return Effect.void;
    },
  });
}

function createTestQueue(shouldFail = false) {
  const enqueued: { url: string; storeId: string }[] = [];
  const layer = Layer.succeed(LinkQueue, {
    enqueue: (url, storeId) => {
      if (shouldFail)
        return Effect.fail(new QueueSendError({ cause: "Queue send failed" }));
      enqueued.push({ url, storeId });
      return Effect.void;
    },
  });
  return { layer, enqueued };
}

function createTestKeyStore() {
  const stored: Map<number, string> = new Map();
  const layer = Layer.succeed(TelegramKeyStore, {
    put: (chatId, apiKey) =>
      Effect.sync(() => {
        stored.set(chatId, apiKey);
      }),
    remove: (chatId) =>
      Effect.sync(() => {
        stored.delete(chatId);
      }),
  });
  return { layer, stored };
}

describe("handleLinks", () => {
  it("PATH 1: enqueues urls and sends draft on success", async () => {
    const messenger = createTestMessenger();
    const queue = createTestQueue();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth({ orgId: "org-1" }),
      queue.layer
    );

    await Effect.runPromise(
      handleLinks(["https://example.com"]).pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    );

    expect(messenger.drafts).toEqual(["Saving link"]);
    expect(messenger.replies).toEqual([]);
    expect(queue.enqueued).toEqual([
      { url: "https://example.com", storeId: "org-1" },
    ]);
  });

  it("PATH 4: sends draft then replies with error when queue fails", async () => {
    const messenger = createTestMessenger();
    const queue = createTestQueue(true);
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth({ orgId: "org-1" }),
      queue.layer
    );

    await Effect.runPromise(
      handleLinks(["https://example.com"]).pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    );

    expect(messenger.drafts).toEqual(["Saving link"]);
    expect(messenger.replies).toEqual([
      "Failed to save link. Please try again later.",
    ]);
  });

  it("PATH 5: replies with connect prompt when not connected", async () => {
    const messenger = createTestMessenger();
    const queue = createTestQueue();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth("not-connected"),
      queue.layer
    );

    await Effect.runPromise(
      handleLinks(["https://example.com"]).pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    );

    expect(messenger.drafts).toEqual([]);
    expect(messenger.replies).toEqual([
      "Please connect first: /connect <api-key>",
    ]);
    expect(queue.enqueued).toEqual([]);
  });

  it("PATH 6: replies when API key is invalid", async () => {
    const messenger = createTestMessenger();
    const queue = createTestQueue();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth("invalid-key"),
      queue.layer
    );

    await Effect.runPromise(
      handleLinks(["https://example.com"]).pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    );

    expect(messenger.drafts).toEqual([]);
    expect(messenger.replies).toEqual([
      "Your API key is no longer valid. Please reconnect: /connect <new-api-key>",
    ]);
  });

  it("PATH 7: replies on rate limit", async () => {
    const messenger = createTestMessenger();
    const queue = createTestQueue();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth("rate-limit"),
      queue.layer
    );

    await Effect.runPromise(
      handleLinks(["https://example.com"]).pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    );

    expect(messenger.drafts).toEqual([]);
    expect(messenger.replies).toEqual([
      "Too many links today. Please try again tomorrow.",
    ]);
  });

  it("enqueues multiple urls", async () => {
    const messenger = createTestMessenger();
    const queue = createTestQueue();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth({ orgId: "org-1" }),
      queue.layer
    );

    await Effect.runPromise(
      handleLinks(["https://a.com", "https://b.com"]).pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    );

    expect(queue.enqueued).toHaveLength(2);
  });
});

describe("handleConnect", () => {
  it("verifies key and stores it", async () => {
    const messenger = createTestMessenger();
    const keyStore = createTestKeyStore();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth({ orgId: "org-1" }),
      keyStore.layer
    );

    await Effect.runPromise(
      handleConnect(123, "sk_test_key").pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    );

    expect(keyStore.stored.get(123)).toBe("sk_test_key");
    expect(messenger.replies).toEqual([
      "Connected! Send me any link to save it.",
    ]);
  });

  it("replies usage when no api key provided", async () => {
    const messenger = createTestMessenger();
    const keyStore = createTestKeyStore();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth({ orgId: "org-1" }),
      keyStore.layer
    );

    await Effect.runPromise(
      handleConnect(123, undefined).pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    );

    expect(keyStore.stored.size).toBe(0);
    expect(messenger.replies).toEqual(["Usage: /connect <api-key>"]);
  });

  it("replies error on invalid key", async () => {
    const messenger = createTestMessenger();
    const keyStore = createTestKeyStore();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth("invalid-key"),
      keyStore.layer
    );

    await Effect.runPromise(
      handleConnect(123, "bad_key").pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    );

    expect(keyStore.stored.size).toBe(0);
    expect(messenger.replies).toEqual(["Invalid or expired API key."]);
  });
});

describe("handleDisconnect", () => {
  it("removes key and replies", async () => {
    const messenger = createTestMessenger();
    const keyStore = createTestKeyStore();
    keyStore.stored.set(123, "sk_test");
    const layer = Layer.mergeAll(messenger.layer, keyStore.layer);

    await Effect.runPromise(
      handleDisconnect(123).pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.None)
      )
    );

    expect(keyStore.stored.has(123)).toBe(false);
    expect(messenger.replies).toEqual([
      "Disconnected. Use /connect <api-key> to reconnect.",
    ]);
  });
});
