import { Context, Schema } from "effect";
import type { Effect } from "effect";

import type { OrgId, UserId } from "../db/branded";
import type {
  TelegramInvalidApiKeyError,
  TelegramMissingOrgIdError,
  NotConnectedError,
  TelegramQueueSendError,
  RateLimitError,
} from "./errors";

export class TelegramBotApiError extends Schema.TaggedError<TelegramBotApiError>()(
  "TelegramBotApiError",
  {
    op: Schema.Literal("sendMessage", "getMe"),
    cause: Schema.Defect,
  }
) {}

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
      { orgId: OrgId; userId: UserId },
      | NotConnectedError
      | TelegramInvalidApiKeyError
      | RateLimitError
      | TelegramMissingOrgIdError
    >;
    readonly verify: (
      apiKey: string
    ) => Effect.Effect<
      { orgId: OrgId; userId: UserId },
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
    readonly linkUser: (userId: UserId, chatId: number) => Effect.Effect<void>;
    readonly unlinkUser: (
      userId: UserId,
      chatId: number
    ) => Effect.Effect<void>;
    readonly listForUser: (userId: UserId) => Effect.Effect<readonly number[]>;
    readonly purgeForUser: (
      userId: UserId
    ) => Effect.Effect<{ deletedCount: number }>;
  }
>() {}

export class TelegramBotApi extends Context.Tag("TelegramBotApi")<
  TelegramBotApi,
  {
    readonly sendMessage: (
      chatId: number,
      text: string
    ) => Effect.Effect<void, TelegramBotApiError>;
    readonly getMe: () => Effect.Effect<
      { username: string | null },
      TelegramBotApiError
    >;
  }
>() {}
