/// <reference types="@cloudflare/workers-types" />
import { Effect, Layer } from "effect";

import { XTweetId, XUserId, XUsername } from "../../db/branded";
import { XSyncStorageError } from "../errors";
import type { Status, XSyncStateSnapshot } from "./x-sync-state-store";
import { XSyncStateStore } from "./x-sync-state-store";

// Storage key constants. Keep them short — they appear in every alarm cycle.
const K_X_USER_ID = "xUserId";
const K_X_USERNAME = "xUsername";
const K_WATERMARK = "watermark";
const K_STATUS = "status";
const K_SYNC_ENABLED = "syncEnabled";

const DEFAULT_STATUS: Status = "active";

const storageError = (op: string) => (cause: unknown) =>
  new XSyncStorageError({ op, cause });

const isStatus = (v: unknown): v is Status =>
  v === "active" ||
  v === "needs_reconnect" ||
  v === "paused" ||
  v === "disconnected";

const asBranded = <B extends string>(
  brand: (v: string) => B,
  raw: unknown
): B | null => (typeof raw === "string" ? brand(raw) : null);

export const XSyncStateStoreLive = (storage: DurableObjectStorage) =>
  Layer.succeed(XSyncStateStore, {
    get: () =>
      Effect.tryPromise({
        try: () =>
          storage.get([
            K_X_USER_ID,
            K_X_USERNAME,
            K_WATERMARK,
            K_STATUS,
            K_SYNC_ENABLED,
          ]),
        catch: storageError("storage.get"),
      }).pipe(
        Effect.map((map): XSyncStateSnapshot | null => {
          const xUserId = asBranded(
            (v) => XUserId.make(v),
            map.get(K_X_USER_ID)
          );
          const xUsername = asBranded(
            (v) => XUsername.make(v),
            map.get(K_X_USERNAME)
          );
          if (!xUserId || !xUsername) return null;
          const rawStatus = map.get(K_STATUS);
          const rawEnabled = map.get(K_SYNC_ENABLED);
          return {
            xUserId,
            xUsername,
            watermarkTweetId: asBranded(
              (v) => XTweetId.make(v),
              map.get(K_WATERMARK)
            ),
            status: isStatus(rawStatus) ? rawStatus : DEFAULT_STATUS,
            syncEnabled: typeof rawEnabled === "boolean" ? rawEnabled : true,
          };
        }),
        Effect.withSpan("XSyncStateStore.get")
      ),

    setIdentity: (identity) =>
      // DOs are single-threaded per object — no concurrent writer can race
      // this read-then-put. Defaults are written only if status / syncEnabled
      // have never been set; subsequent reconnects leave them untouched.
      Effect.tryPromise({
        try: async () => {
          const [existingStatus, existingEnabled] = await Promise.all([
            storage.get<Status>(K_STATUS),
            storage.get<boolean>(K_SYNC_ENABLED),
          ]);
          await storage.put({
            [K_X_USER_ID]: identity.xUserId,
            [K_X_USERNAME]: identity.xUsername,
            [K_STATUS]: existingStatus ?? DEFAULT_STATUS,
            [K_SYNC_ENABLED]: existingEnabled ?? true,
          });
        },
        catch: storageError("storage.setIdentity"),
      }).pipe(Effect.withSpan("XSyncStateStore.setIdentity")),

    setWatermark: (tweetId) =>
      Effect.tryPromise({
        try: () => storage.put(K_WATERMARK, tweetId),
        catch: storageError("storage.setWatermark"),
      }).pipe(
        Effect.withSpan("XSyncStateStore.setWatermark", {
          attributes: { tweetId },
        })
      ),

    setStatus: (status) =>
      Effect.tryPromise({
        try: () => storage.put(K_STATUS, status),
        catch: storageError("storage.setStatus"),
      }).pipe(
        Effect.withSpan("XSyncStateStore.setStatus", {
          attributes: { status },
        })
      ),

    setSyncEnabled: (enabled) =>
      Effect.tryPromise({
        try: () => storage.put(K_SYNC_ENABLED, enabled),
        catch: storageError("storage.setSyncEnabled"),
      }).pipe(
        Effect.withSpan("XSyncStateStore.setSyncEnabled", {
          attributes: { enabled },
        })
      ),

    clear: () =>
      Effect.tryPromise({
        try: () => storage.deleteAll(),
        catch: storageError("storage.clear"),
      }).pipe(Effect.withSpan("XSyncStateStore.clear")),
  });
