import { Context } from "effect";
import type { Effect } from "effect";

import type { OrgId } from "../db/branded";
import type {
  TelegramInvalidApiKeyError,
  TelegramMissingOrgIdError,
  NotConnectedError,
  TelegramQueueSendError,
  RateLimitError,
} from "./errors";

export class Messenger extends Context.Tag("Messenger")<
  Messenger,
  {
    readonly draft: (text: string) => Effect.Effect<void>;
    readonly reply: (text: string) => Effect.Effect<void>;
  }
>() {}

export class SourceAuth extends Context.Tag("SourceAuth")<
  SourceAuth,
  {
    readonly authenticate: () => Effect.Effect<
      { orgId: OrgId },
      | NotConnectedError
      | TelegramInvalidApiKeyError
      | RateLimitError
      | TelegramMissingOrgIdError
    >;
    readonly verify: (
      apiKey: string
    ) => Effect.Effect<
      void,
      TelegramInvalidApiKeyError | RateLimitError | TelegramMissingOrgIdError
    >;
  }
>() {}

export class LinkQueue extends Context.Tag("LinkQueue")<
  LinkQueue,
  {
    readonly enqueue: (
      url: string,
      storeId: OrgId
    ) => Effect.Effect<void, TelegramQueueSendError>;
  }
>() {}

export class TelegramKeyStore extends Context.Tag("TelegramKeyStore")<
  TelegramKeyStore,
  {
    readonly put: (chatId: number, apiKey: string) => Effect.Effect<void>;
    readonly remove: (chatId: number) => Effect.Effect<void>;
  }
>() {}
