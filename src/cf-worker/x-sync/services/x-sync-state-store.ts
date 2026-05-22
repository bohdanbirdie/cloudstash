import { Context } from "effect";
import type { Effect } from "effect";

import type { XTweetId, XUserId, XUsername } from "../../db/branded";
import type { XSyncStorageError } from "../errors";

export type Status = "active" | "needs_reconnect" | "paused" | "disconnected";

export interface XSyncIdentity {
  readonly xUserId: XUserId;
  readonly xUsername: XUsername;
}

export interface XSyncStateSnapshot {
  readonly xUserId: XUserId;
  readonly xUsername: XUsername;
  readonly watermarkTweetId: XTweetId | null;
  readonly status: Status;
  readonly syncEnabled: boolean;
}

export class XSyncStateStore extends Context.Tag(
  "@cloudstash/x-sync/XSyncStateStore"
)<
  XSyncStateStore,
  {
    /** Returns null if the DO has never been initialized (no identity set). */
    readonly get: () => Effect.Effect<
      XSyncStateSnapshot | null,
      XSyncStorageError
    >;
    /** Initial identity write on connect. Idempotent. */
    readonly setIdentity: (
      identity: XSyncIdentity
    ) => Effect.Effect<void, XSyncStorageError>;
    readonly setWatermark: (
      tweetId: XTweetId
    ) => Effect.Effect<void, XSyncStorageError>;
    readonly setStatus: (
      status: Status
    ) => Effect.Effect<void, XSyncStorageError>;
    readonly setSyncEnabled: (
      enabled: boolean
    ) => Effect.Effect<void, XSyncStorageError>;
    /** Wipe all keys. Called on disconnect / account deletion. */
    readonly clear: () => Effect.Effect<void, XSyncStorageError>;
  }
>() {}
