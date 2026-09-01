/// <reference types="@cloudflare/workers-types" />
import { Effect, Layer, Option, Schema } from "effect";

import { XSyncStatus } from "../../../lib/x-sync-status";
import { OrgId, XTweetId, XUserId, XUsername } from "../../db/branded";
import { maskId } from "../../log-utils";
import { XSyncStorageError } from "../errors";
import { activePollControl, XSyncPollControl } from "../poll-control";
import {
  defaultReconnectReason,
  XSyncReconnectReason,
} from "../reconnect-reason";
import {
  XSyncReadUsage,
  XSyncScanState,
  XSyncStateStore,
} from "./x-sync-state-store";
import type {
  Status,
  XSyncControlState,
  XSyncStateSnapshot,
  XSyncStateStoreShape,
} from "./x-sync-state-store";

const K_X_USER_ID = "xUserId";
const K_X_USERNAME = "xUsername";
const K_WATERMARK = "watermark";
const K_STATUS = "status";
const K_SYNC_ENABLED = "syncEnabled";
const K_ORGANIZATION_ID = "organizationId";
const K_POLL_CONTROL = "pollControl";
const K_RECONNECT_REASON = "reconnectReason";
const K_CHECKPOINTS = "checkpoints";
const K_SCAN = "scan";
const K_READ_USAGE = "readUsage";
const STATE_KEYS = [
  K_X_USER_ID,
  K_X_USERNAME,
  K_WATERMARK,
  K_STATUS,
  K_SYNC_ENABLED,
  K_ORGANIZATION_ID,
] as const;

const DEFAULT_STATUS: Status = "active";

const storageError = (op: string) => (cause: unknown) =>
  new XSyncStorageError({ op, cause });

const decodeOrNull = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  raw: unknown
): S["Type"] | null =>
  Schema.decodeUnknownOption(schema)(raw).pipe(Option.getOrNull);

const decodeStatus = (raw: unknown): Status =>
  Schema.decodeUnknownOption(XSyncStatus)(raw).pipe(
    Option.getOrElse(() => DEFAULT_STATUS)
  );

const hasState = (map: ReadonlyMap<string, unknown>): boolean =>
  STATE_KEYS.some((key) => map.has(key));

export const makeXSyncStateStore = (
  storage: DurableObjectStorage
): XSyncStateStoreShape => ({
  read: Effect.fn("XSyncStateStore.read")(function* () {
    const map = yield* Effect.tryPromise({
      try: () => storage.get([...STATE_KEYS]),
      catch: storageError("storage.read"),
    });
    if (!hasState(map)) return null;

    const xUserId = decodeOrNull(XUserId, map.get(K_X_USER_ID));
    const xUsername = decodeOrNull(XUsername, map.get(K_X_USERNAME));
    const shared = {
      organizationId: decodeOrNull(OrgId, map.get(K_ORGANIZATION_ID)),
      status: decodeStatus(map.get(K_STATUS)),
      syncEnabled:
        decodeOrNull(Schema.Boolean, map.get(K_SYNC_ENABLED)) ?? true,
      watermarkTweetId: decodeOrNull(XTweetId, map.get(K_WATERMARK)),
    };
    if (xUserId && xUsername) {
      return { ...shared, xUserId, xUsername } satisfies XSyncStateSnapshot;
    }
    return {
      ...shared,
      xUserId: null,
      xUsername: null,
    } satisfies XSyncStateSnapshot;
  }),

  setIdentity: Effect.fn("XSyncStateStore.setIdentity")(function* (identity) {
    yield* Effect.tryPromise({
      try: async () => {
        const existing = await storage.get([K_STATUS, K_SYNC_ENABLED]);
        await storage.put({
          [K_X_USER_ID]: identity.xUserId,
          [K_X_USERNAME]: identity.xUsername,
          [K_STATUS]: existing.get(K_STATUS) ?? DEFAULT_STATUS,
          [K_SYNC_ENABLED]: existing.get(K_SYNC_ENABLED) ?? true,
        });
      },
      catch: storageError("storage.setIdentity"),
    });
  }),

  setWatermark: Effect.fn("XSyncStateStore.setWatermark")(function* (tweetId) {
    yield* Effect.annotateCurrentSpan("tweetId", tweetId);
    yield* Effect.tryPromise({
      try: () => storage.put(K_WATERMARK, tweetId),
      catch: storageError("storage.setWatermark"),
    });
  }),

  readCheckpoints: Effect.fn("XSyncStateStore.readCheckpoints")(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => storage.get(K_CHECKPOINTS),
      catch: storageError("storage.readCheckpoints"),
    });
    if (raw === undefined) return [];
    return yield* Schema.decodeUnknownEffect(Schema.Array(XTweetId))(raw).pipe(
      Effect.mapError(storageError("storage.decodeCheckpoints"))
    );
  }),

  setCheckpoints: Effect.fn("XSyncStateStore.setCheckpoints")(
    function* (tweetIds) {
      yield* Effect.tryPromise({
        try: () => storage.put(K_CHECKPOINTS, [...tweetIds]),
        catch: storageError("storage.setCheckpoints"),
      });
    }
  ),

  readScan: Effect.fn("XSyncStateStore.readScan")(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => storage.get(K_SCAN),
      catch: storageError("storage.readScan"),
    });
    if (raw === undefined) return null;
    return yield* Schema.decodeUnknownEffect(XSyncScanState)(raw).pipe(
      Effect.mapError(storageError("storage.decodeScan"))
    );
  }),

  setScan: Effect.fn("XSyncStateStore.setScan")(function* (scan) {
    yield* Effect.tryPromise({
      try: () => storage.put(K_SCAN, scan),
      catch: storageError("storage.setScan"),
    });
  }),

  clearScan: Effect.fn("XSyncStateStore.clearScan")(function* () {
    yield* Effect.tryPromise({
      try: () => storage.delete(K_SCAN),
      catch: storageError("storage.clearScan"),
    });
  }),

  readReadUsage: Effect.fn("XSyncStateStore.readReadUsage")(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => storage.get(K_READ_USAGE),
      catch: storageError("storage.readReadUsage"),
    });
    if (raw === undefined) return null;
    return yield* Schema.decodeUnknownEffect(XSyncReadUsage)(raw).pipe(
      Effect.mapError(storageError("storage.decodeReadUsage"))
    );
  }),

  setReadUsage: Effect.fn("XSyncStateStore.setReadUsage")(function* (usage) {
    yield* Effect.tryPromise({
      try: () => storage.put(K_READ_USAGE, usage),
      catch: storageError("storage.setReadUsage"),
    });
  }),

  setStatus: Effect.fn("XSyncStateStore.setStatus")(function* (status) {
    yield* Effect.annotateCurrentSpan("status", status);
    yield* Effect.tryPromise({
      try: async () => {
        if ((await storage.get<Status>(K_STATUS)) !== status) {
          await storage.put(K_STATUS, status);
        }
      },
      catch: storageError("storage.setStatus"),
    });
  }),

  setSyncEnabled: Effect.fn("XSyncStateStore.setSyncEnabled")(
    function* (enabled) {
      yield* Effect.annotateCurrentSpan("enabled", enabled);
      yield* Effect.tryPromise({
        try: async () => {
          if ((await storage.get<boolean>(K_SYNC_ENABLED)) !== enabled) {
            await storage.put(K_SYNC_ENABLED, enabled);
          }
        },
        catch: storageError("storage.setSyncEnabled"),
      });
    }
  ),

  setControl: Effect.fn("XSyncStateStore.setControl")(function* (
    control: XSyncControlState
  ) {
    if (control.organizationId) {
      yield* Effect.annotateCurrentSpan(
        "organizationId",
        maskId(control.organizationId)
      );
    }
    yield* Effect.annotateCurrentSpan("status", control.status);
    yield* Effect.tryPromise({
      try: () =>
        storage.put({
          [K_ORGANIZATION_ID]: control.organizationId,
          [K_STATUS]: control.status,
        }),
      catch: storageError("storage.setControl"),
    });
  }),

  readPollControl: Effect.fn("XSyncStateStore.readPollControl")(function* () {
    const raw = yield* Effect.tryPromise({
      try: () => storage.get(K_POLL_CONTROL),
      catch: storageError("storage.readPollControl"),
    });
    return Schema.decodeUnknownOption(XSyncPollControl)(raw).pipe(
      Option.getOrElse(() => activePollControl)
    );
  }),

  setPollControl: Effect.fn("XSyncStateStore.setPollControl")(
    function* (control) {
      yield* Effect.tryPromise({
        try: () => storage.put(K_POLL_CONTROL, control),
        catch: storageError("storage.setPollControl"),
      });
    }
  ),

  readReconnectReason: Effect.fn("XSyncStateStore.readReconnectReason")(
    function* () {
      const raw = yield* Effect.tryPromise({
        try: () => storage.get(K_RECONNECT_REASON),
        catch: storageError("storage.readReconnectReason"),
      });
      return Schema.decodeUnknownOption(XSyncReconnectReason)(raw).pipe(
        Option.getOrElse(() => defaultReconnectReason)
      );
    }
  ),

  setReconnectReason: Effect.fn("XSyncStateStore.setReconnectReason")(
    function* (reason) {
      yield* Effect.annotateCurrentSpan("reconnectReason", reason);
      yield* Effect.tryPromise({
        try: () => storage.put(K_RECONNECT_REASON, reason),
        catch: storageError("storage.setReconnectReason"),
      });
    }
  ),

  clear: Effect.fn("XSyncStateStore.clear")(function* () {
    yield* Effect.tryPromise({
      try: () => storage.deleteAll(),
      catch: storageError("storage.clear"),
    });
  }),
});

export const XSyncStateStoreLive = (storage: DurableObjectStorage) =>
  Layer.succeed(XSyncStateStore, makeXSyncStateStore(storage));
