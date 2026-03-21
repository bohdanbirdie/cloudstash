import { Context } from "effect";
import type { Effect } from "effect";

import type {
  InvalidApiKeyError,
  MissingOrgIdError,
  NotConnectedError,
  QueueSendError,
  RateLimitError,
} from "./errors";

export class Messenger extends Context.Tag("Messenger")<
  Messenger,
  {
    readonly react: (emoji: string) => Effect.Effect<void>;
    readonly reply: (text: string) => Effect.Effect<void>;
  }
>() {}

export class SourceAuth extends Context.Tag("SourceAuth")<
  SourceAuth,
  {
    readonly authenticate: () => Effect.Effect<
      { orgId: string },
      | NotConnectedError
      | InvalidApiKeyError
      | RateLimitError
      | MissingOrgIdError
    >;
    readonly verify: (
      apiKey: string
    ) => Effect.Effect<
      void,
      InvalidApiKeyError | RateLimitError | MissingOrgIdError
    >;
  }
>() {}

export class LinkQueue extends Context.Tag("LinkQueue")<
  LinkQueue,
  {
    readonly enqueue: (
      url: string,
      storeId: string
    ) => Effect.Effect<void, QueueSendError>;
  }
>() {}

export class TelegramKeyStore extends Context.Tag("TelegramKeyStore")<
  TelegramKeyStore,
  {
    readonly put: (chatId: number, apiKey: string) => Effect.Effect<void>;
    readonly remove: (chatId: number) => Effect.Effect<void>;
  }
>() {}
