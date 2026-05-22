import { Context, Schema } from "effect";
import type { Effect } from "effect";

import type { OrgId, UserId } from "../db/branded";
import type { DbError } from "../db/service";
import type { KeyCreationError, SessionLookupError } from "./errors";

export class InvalidVerificationPayloadError extends Schema.TaggedError<InvalidVerificationPayloadError>()(
  "InvalidVerificationPayloadError",
  {
    identifier: Schema.String,
  }
) {}

export interface ApiKeyInfo {
  readonly id: string;
  readonly metadata: string | null;
}

export interface VerificationData {
  readonly key: string;
  readonly keyId: string;
}

export interface VerificationRecord {
  readonly id: string;
  readonly data: VerificationData;
}

export interface SessionData {
  readonly userId: UserId;
  readonly orgId: OrgId | null;
}

export class SessionProvider extends Context.Tag("SessionProvider")<
  SessionProvider,
  {
    // Returns null when there's no session; fails with SessionLookupError when
    // the auth backend itself is unreachable. Callers can map the two to
    // 401 vs 5xx.
    readonly getSession: (
      headers: Headers
    ) => Effect.Effect<SessionData | null, SessionLookupError>;
  }
>() {}

export class ApiKeyStore extends Context.Tag("ApiKeyStore")<
  ApiKeyStore,
  {
    readonly listByUser: (
      userId: UserId
    ) => Effect.Effect<ApiKeyInfo[], DbError>;
    readonly deleteById: (id: string) => Effect.Effect<void, DbError>;
    readonly create: (
      headers: Headers,
      metadata: { orgId: OrgId; source: string },
      name: string
    ) => Effect.Effect<{ key: string; id: string }, KeyCreationError>;
    readonly updateName: (
      id: string,
      name: string
    ) => Effect.Effect<void, DbError>;
  }
>() {}

export class VerificationStore extends Context.Tag("VerificationStore")<
  VerificationStore,
  {
    readonly save: (
      identifier: string,
      data: VerificationData,
      ttlMs: number
    ) => Effect.Effect<void, DbError>;
    readonly consumeByIdentifier: (
      identifier: string
    ) => Effect.Effect<VerificationRecord | null, DbError>;
  }
>() {}

export interface TelegramConnectCode {
  readonly recordId: string;
  readonly chatId: number;
}

export class TelegramConnectStore extends Context.Tag("TelegramConnectStore")<
  TelegramConnectStore,
  {
    readonly issueCode: (chatId: number) => Effect.Effect<string, DbError>;
    readonly findByCode: (
      code: string
    ) => Effect.Effect<
      TelegramConnectCode | null,
      DbError | InvalidVerificationPayloadError
    >;
    readonly consumeByCode: (
      code: string
    ) => Effect.Effect<
      TelegramConnectCode | null,
      DbError | InvalidVerificationPayloadError
    >;
  }
>() {}
