import { Context, Schema } from "effect";
import type { Effect } from "effect";

import { XSyncStatus } from "../../../lib/x-sync-status";
import { OrgId, XTweetId, XUserId, XUsername } from "../../db/branded";
import type { XSyncStorageError } from "../errors";
import type { XSyncPollControl } from "../poll-control";
import type { XSyncReconnectReason } from "../reconnect-reason";
import { XBookmarkTweet } from "../services";

const XSyncStateFields = {
  organizationId: Schema.NullOr(OrgId),
  status: XSyncStatus,
  syncEnabled: Schema.Boolean,
  watermarkTweetId: Schema.NullOr(XTweetId),
};

export const XSyncConnectedState = Schema.Struct({
  ...XSyncStateFields,
  xUserId: XUserId,
  xUsername: XUsername,
});
export type XSyncConnectedState = typeof XSyncConnectedState.Type;

const XSyncPendingState = Schema.Struct({
  ...XSyncStateFields,
  xUserId: Schema.Null,
  xUsername: Schema.Null,
});

export const XSyncStateSnapshot = Schema.Union([
  XSyncConnectedState,
  XSyncPendingState,
]);
export type XSyncStateSnapshot = typeof XSyncStateSnapshot.Type;
export type Status = typeof XSyncStatus.Type;

export const XSyncControlState = Schema.Struct({
  organizationId: Schema.NullOr(OrgId),
  status: XSyncStatus,
});
export type XSyncControlState = typeof XSyncControlState.Type;

export const XSyncIdentity = Schema.Struct({
  xUserId: XUserId,
  xUsername: XUsername,
});
export type XSyncIdentity = typeof XSyncIdentity.Type;

export const XSyncScanState = Schema.Struct({
  headTweetId: XTweetId,
  nextToken: Schema.NullOr(Schema.String),
  bookmarks: Schema.Array(XBookmarkTweet),
  complete: Schema.Boolean,
});
export type XSyncScanState = typeof XSyncScanState.Type;

export const XSyncReadUsage = Schema.Struct({
  windowId: Schema.String,
  billableKeys: Schema.Array(Schema.String),
});
export type XSyncReadUsage = typeof XSyncReadUsage.Type;

export interface XSyncStateStoreShape {
  readonly read: () => Effect.Effect<
    XSyncStateSnapshot | null,
    XSyncStorageError
  >;
  readonly setIdentity: (
    identity: XSyncIdentity
  ) => Effect.Effect<void, XSyncStorageError>;
  readonly setWatermark: (
    tweetId: XTweetId
  ) => Effect.Effect<void, XSyncStorageError>;
  readonly readCheckpoints: () => Effect.Effect<
    readonly XTweetId[],
    XSyncStorageError
  >;
  readonly setCheckpoints: (
    tweetIds: readonly XTweetId[]
  ) => Effect.Effect<void, XSyncStorageError>;
  readonly readScan: () => Effect.Effect<
    XSyncScanState | null,
    XSyncStorageError
  >;
  readonly setScan: (
    scan: XSyncScanState
  ) => Effect.Effect<void, XSyncStorageError>;
  readonly clearScan: () => Effect.Effect<void, XSyncStorageError>;
  readonly readReadUsage: () => Effect.Effect<
    XSyncReadUsage | null,
    XSyncStorageError
  >;
  readonly setReadUsage: (
    usage: XSyncReadUsage
  ) => Effect.Effect<void, XSyncStorageError>;
  readonly setStatus: (
    status: Status
  ) => Effect.Effect<void, XSyncStorageError>;
  readonly setSyncEnabled: (
    enabled: boolean
  ) => Effect.Effect<void, XSyncStorageError>;
  readonly setControl: (
    control: XSyncControlState
  ) => Effect.Effect<void, XSyncStorageError>;
  readonly readPollControl: () => Effect.Effect<
    XSyncPollControl,
    XSyncStorageError
  >;
  readonly setPollControl: (
    control: XSyncPollControl
  ) => Effect.Effect<void, XSyncStorageError>;
  readonly readReconnectReason: () => Effect.Effect<
    XSyncReconnectReason,
    XSyncStorageError
  >;
  readonly setReconnectReason: (
    reason: XSyncReconnectReason
  ) => Effect.Effect<void, XSyncStorageError>;
  readonly clear: () => Effect.Effect<void, XSyncStorageError>;
}

export class XSyncStateStore extends Context.Service<
  XSyncStateStore,
  XSyncStateStoreShape
>()("@cloudstash/x-sync/services/XSyncStateStore") {}
