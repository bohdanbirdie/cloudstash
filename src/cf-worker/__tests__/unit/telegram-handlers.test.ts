import { it, describe } from "@effect/vitest";
import { Effect, Layer, LogLevel, Logger } from "effect";
import { expect } from "vitest";

import { OrgId } from "../../db/branded";
import {
  TelegramInvalidApiKeyError,
  TelegramMissingOrgIdError,
  NotConnectedError,
  TelegramQueueSendError,
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
    | { orgId: typeof OrgId.Type }
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
        return Effect.fail(new TelegramInvalidApiKeyError({}));
      if (result === "rate-limit") return Effect.fail(new RateLimitError({}));
      if (result === "missing-org-id")
        return Effect.fail(new TelegramMissingOrgIdError({}));
      return Effect.succeed(result);
    },
    verify: (_apiKey) => {
      if (result === "invalid-key")
        return Effect.fail(new TelegramInvalidApiKeyError({}));
      if (result === "rate-limit") return Effect.fail(new RateLimitError({}));
      if (result === "missing-org-id")
        return Effect.fail(new TelegramMissingOrgIdError({}));
      return Effect.void;
    },
  });
}

function createTestQueue(shouldFail = false) {
  const enqueued: { url: string; storeId: string }[] = [];
  const layer = Layer.succeed(LinkQueue, {
    enqueue: (url, storeId) => {
      if (shouldFail)
        return Effect.fail(
          new TelegramQueueSendError({ cause: "Queue send failed" })
        );
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
  it.effect("PATH 1: enqueues urls and sends draft on success", () => {
    const messenger = createTestMessenger();
    const queue = createTestQueue();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth({ orgId: OrgId.make("org-1") }),
      queue.layer
    );

    return handleLinks(["https://example.com"]).pipe(
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.None),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messenger.drafts).toEqual(["Saving link"]);
          expect(messenger.replies).toEqual([]);
          expect(queue.enqueued).toEqual([
            { url: "https://example.com", storeId: "org-1" },
          ]);
        })
      )
    );
  });

  it.effect(
    "PATH 4: sends draft then replies with error when queue fails",
    () => {
      const messenger = createTestMessenger();
      const queue = createTestQueue(true);
      const layer = Layer.mergeAll(
        messenger.layer,
        createTestSourceAuth({ orgId: OrgId.make("org-1") }),
        queue.layer
      );

      return handleLinks(["https://example.com"]).pipe(
        Effect.provide(layer),
        Logger.withMinimumLogLevel(LogLevel.None),
        Effect.tap(() =>
          Effect.sync(() => {
            expect(messenger.drafts).toEqual(["Saving link"]);
            expect(messenger.replies).toEqual([
              "Failed to save link. Please try again later.",
            ]);
          })
        )
      );
    }
  );

  it.effect("PATH 5: replies with connect prompt when not connected", () => {
    const messenger = createTestMessenger();
    const queue = createTestQueue();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth("not-connected"),
      queue.layer
    );

    return handleLinks(["https://example.com"]).pipe(
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.None),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messenger.drafts).toEqual([]);
          expect(messenger.replies).toEqual([
            "Please connect first: /connect <api-key>",
          ]);
          expect(queue.enqueued).toEqual([]);
        })
      )
    );
  });

  it.effect("PATH 6: replies when API key is invalid", () => {
    const messenger = createTestMessenger();
    const queue = createTestQueue();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth("invalid-key"),
      queue.layer
    );

    return handleLinks(["https://example.com"]).pipe(
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.None),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messenger.drafts).toEqual([]);
          expect(messenger.replies).toEqual([
            "Your API key is no longer valid. Please reconnect: /connect <new-api-key>",
          ]);
        })
      )
    );
  });

  it.effect("PATH 7: replies on rate limit", () => {
    const messenger = createTestMessenger();
    const queue = createTestQueue();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth("rate-limit"),
      queue.layer
    );

    return handleLinks(["https://example.com"]).pipe(
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.None),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(messenger.drafts).toEqual([]);
          expect(messenger.replies).toEqual([
            "Too many links today. Please try again tomorrow.",
          ]);
        })
      )
    );
  });

  it.effect("enqueues multiple urls", () => {
    const messenger = createTestMessenger();
    const queue = createTestQueue();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth({ orgId: OrgId.make("org-1") }),
      queue.layer
    );

    return handleLinks(["https://a.com", "https://b.com"]).pipe(
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.None),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(queue.enqueued).toHaveLength(2);
        })
      )
    );
  });
});

describe("handleConnect", () => {
  it.effect("verifies key and stores it", () => {
    const messenger = createTestMessenger();
    const keyStore = createTestKeyStore();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth({ orgId: OrgId.make("org-1") }),
      keyStore.layer
    );

    return handleConnect(123, "sk_test_key").pipe(
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.None),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(keyStore.stored.get(123)).toBe("sk_test_key");
          expect(messenger.replies).toEqual([
            "Connected! Send me any link to save it.",
          ]);
        })
      )
    );
  });

  it.effect("replies usage when no api key provided", () => {
    const messenger = createTestMessenger();
    const keyStore = createTestKeyStore();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth({ orgId: OrgId.make("org-1") }),
      keyStore.layer
    );

    return handleConnect(123, undefined).pipe(
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.None),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(keyStore.stored.size).toBe(0);
          expect(messenger.replies).toEqual(["Usage: /connect <api-key>"]);
        })
      )
    );
  });

  it.effect("replies error on invalid key", () => {
    const messenger = createTestMessenger();
    const keyStore = createTestKeyStore();
    const layer = Layer.mergeAll(
      messenger.layer,
      createTestSourceAuth("invalid-key"),
      keyStore.layer
    );

    return handleConnect(123, "bad_key").pipe(
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.None),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(keyStore.stored.size).toBe(0);
          expect(messenger.replies).toEqual(["Invalid or expired API key."]);
        })
      )
    );
  });
});

describe("handleDisconnect", () => {
  it.effect("removes key and replies", () => {
    const messenger = createTestMessenger();
    const keyStore = createTestKeyStore();
    keyStore.stored.set(123, "sk_test");
    const layer = Layer.mergeAll(messenger.layer, keyStore.layer);

    return handleDisconnect(123).pipe(
      Effect.provide(layer),
      Logger.withMinimumLogLevel(LogLevel.None),
      Effect.tap(() =>
        Effect.sync(() => {
          expect(keyStore.stored.has(123)).toBe(false);
          expect(messenger.replies).toEqual([
            "Disconnected. Use /connect <api-key> to reconnect.",
          ]);
        })
      )
    );
  });
});
