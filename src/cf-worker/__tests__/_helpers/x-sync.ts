import { Effect, Layer } from "effect";

import { AuthClient } from "../../auth/service";
import { XTweetId, XUserId, XUsername } from "../../db/branded";
import { DbClient } from "../../db/service";
import { OtelTracingLive } from "../../tracing";
import type { BookmarksPage } from "../../x-sync/services";
import { XApiClient } from "../../x-sync/services";
import { LinkQueueClient } from "../../x-sync/services/link-queue-client";
import type {
  Status,
  XSyncStateSnapshot,
} from "../../x-sync/services/x-sync-state-store";
import { XSyncStateStore } from "../../x-sync/services/x-sync-state-store";

export const X_USER = XUserId.make("xuser-1");
export const X_NAME = XUsername.make("alice");
export const ORG_ID = "org-1";

export const makeSnapshot = (
  overrides: Partial<XSyncStateSnapshot> = {}
): XSyncStateSnapshot => ({
  xUserId: X_USER,
  xUsername: X_NAME,
  watermarkTweetId: null,
  status: "active",
  syncEnabled: true,
  ...overrides,
});

export interface StoreRec {
  snapshot: XSyncStateSnapshot | null;
  setWatermarkCalls: XTweetId[];
  setStatusCalls: Status[];
  setSyncEnabledCalls: boolean[];
  setIdentityCalls: number;
  clearCalls: number;
}

export const makeStoreLayer = (initial: XSyncStateSnapshot | null) => {
  const rec: StoreRec = {
    snapshot: initial,
    setWatermarkCalls: [],
    setStatusCalls: [],
    setSyncEnabledCalls: [],
    setIdentityCalls: 0,
    clearCalls: 0,
  };
  const layer = Layer.succeed(XSyncStateStore, {
    get: () => Effect.succeed(rec.snapshot),
    setIdentity: () =>
      Effect.sync(() => {
        rec.setIdentityCalls += 1;
      }),
    setWatermark: (tweetId: XTweetId) =>
      Effect.sync(() => {
        rec.setWatermarkCalls.push(tweetId);
        if (rec.snapshot)
          rec.snapshot = { ...rec.snapshot, watermarkTweetId: tweetId };
      }),
    setStatus: (status: Status) =>
      Effect.sync(() => {
        rec.setStatusCalls.push(status);
        if (rec.snapshot) rec.snapshot = { ...rec.snapshot, status };
      }),
    setSyncEnabled: (enabled: boolean) =>
      Effect.sync(() => {
        rec.setSyncEnabledCalls.push(enabled);
        if (rec.snapshot)
          rec.snapshot = { ...rec.snapshot, syncEnabled: enabled };
      }),
    clear: () =>
      Effect.sync(() => {
        rec.clearCalls += 1;
        rec.snapshot = null;
      }),
  });
  return { layer, rec };
};

export const makeAuthLayer = (accessToken: string | null = "tok-1") =>
  Layer.succeed(AuthClient, {
    api: {
      getAccessToken: async () =>
        accessToken === null ? null : { accessToken },
    },
  } as never);

// DbClient is consumed only via `query(db.query.member.findFirst(...))` in
// getOrgIdEffect. A duck-typed stub is enough.
export const makeDbLayer = (orgId: string | null = ORG_ID) =>
  Layer.succeed(DbClient, {
    query: {
      member: {
        findFirst: async () =>
          orgId === null ? undefined : { organizationId: orgId },
      },
    },
  } as never);

export type ScriptedBookmarksResponse =
  | { kind: "ok"; page: BookmarksPage }
  | { kind: "fail"; error: unknown };

export const makeXApiLayer = (responses: ScriptedBookmarksResponse[]) => {
  const calls: Array<{ maxResults: number; paginationToken?: string }> = [];
  let cursor = 0;
  const layer = Layer.succeed(XApiClient, {
    getMe: () =>
      Effect.succeed({
        id: X_USER,
        username: X_NAME,
        name: "Alice",
      }),
    getBookmarks: (params) => {
      calls.push({
        maxResults: params.maxResults,
        paginationToken: params.paginationToken,
      });
      const r = responses[cursor++];
      if (!r) {
        return Effect.die(`no scripted response for call ${cursor}`);
      }
      if (r.kind === "fail") {
        return Effect.fail(r.error as never);
      }
      return Effect.succeed(r.page);
    },
  });
  return { layer, calls };
};

export interface QueueCall {
  url: string;
  storeId: string;
  source: string;
  sourceMeta: string;
}

export const makeQueueLayer = () => {
  const calls: QueueCall[] = [];
  const layer = Layer.succeed(LinkQueueClient, {
    send: (msg) =>
      Effect.sync(() => {
        calls.push(msg as QueueCall);
      }),
  });
  return { layer, calls };
};

export const baseLayers = (
  store: Layer.Layer<XSyncStateStore>,
  x: Layer.Layer<XApiClient>,
  queue: Layer.Layer<LinkQueueClient>,
  options: { auth?: Layer.Layer<AuthClient>; orgId?: string | null } = {}
) =>
  Layer.mergeAll(
    store,
    makeDbLayer(options.orgId === undefined ? ORG_ID : options.orgId),
    options.auth ?? makeAuthLayer(),
    x,
    queue,
    OtelTracingLive
  );
