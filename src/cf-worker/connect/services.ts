import { Context } from "effect";
import type { Effect } from "effect";

import type { OrgId, UserId } from "../db/branded";
import type { DbError } from "../db/service";

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
    readonly getSession: (
      headers: Headers
    ) => Effect.Effect<SessionData | null>;
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
    ) => Effect.Effect<{ key: string; id: string } | null>;
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
    readonly findValid: (
      identifier: string
    ) => Effect.Effect<VerificationRecord | null, DbError>;
    readonly deleteById: (id: string) => Effect.Effect<void, DbError>;
  }
>() {}
