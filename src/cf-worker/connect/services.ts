import { Context } from "effect";
import type { Effect } from "effect";

import type { DbError } from "../db/service";

export interface ApiKeyInfo {
  readonly id: string;
  readonly metadata: string | null;
}

export interface VerificationRecord {
  readonly id: string;
  readonly value: string;
  readonly keyId?: string;
}

export interface SessionData {
  readonly userId: string;
  readonly orgId: string | null;
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
      userId: string
    ) => Effect.Effect<ApiKeyInfo[], DbError>;
    readonly deleteById: (id: string) => Effect.Effect<void, DbError>;
    readonly create: (
      headers: Headers,
      metadata: { orgId: string; source: string },
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
      value: string,
      ttlMs: number
    ) => Effect.Effect<void, DbError>;
    readonly findValid: (
      identifier: string
    ) => Effect.Effect<VerificationRecord | null, DbError>;
    readonly deleteById: (id: string) => Effect.Effect<void, DbError>;
  }
>() {}
