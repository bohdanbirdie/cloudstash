import { Effect, Layer, Option } from "effect";

import { TIER_CAPABILITIES } from "@/lib/plan";

import { OrgId, UserId, XTweetId, XUserId, XUsername } from "../../db/branded";
import type { LinkQueueMessage } from "../../link-processor/types";
import { OtelTracingLive } from "../../tracing";
import { XSyncAccountRepository } from "../../x-sync/account";
import type { XApiFailure } from "../../x-sync/errors";
import { XSyncSideEffectError } from "../../x-sync/errors";
import { activePollControl } from "../../x-sync/poll-control";
import type { XSyncPollControl } from "../../x-sync/poll-control";
import { defaultReconnectReason } from "../../x-sync/reconnect-reason";
import type { XSyncReconnectReason } from "../../x-sync/reconnect-reason";
import type { BookmarksPage } from "../../x-sync/services";
import { XApiClient } from "../../x-sync/services";
import { LinkQueueClient } from "../../x-sync/services/link-queue-client";
import { XSyncAlarm } from "../../x-sync/services/x-sync-alarm";
import type {
  Status,
  XSyncConnectedState,
  XSyncControlState,
  XSyncReadUsage,
  XSyncScanState,
  XSyncStateSnapshot,
} from "../../x-sync/services/x-sync-state-store";
import { XSyncStateStore } from "../../x-sync/services/x-sync-state-store";

export const X_USER = XUserId.make("xuser-1");
export const X_NAME = XUsername.make("alice");
export const ORG_ID = OrgId.make("org-1");
export const USAGE_WINDOW = {
  id: "2026-08-01T00:00:00.000Z",
  startsAt: "2026-08-01T00:00:00.000Z",
  resetsAt: "2026-09-01T00:00:00.000Z",
} as const;

export const makeSnapshot = (
  overrides: Partial<XSyncConnectedState> = {}
): XSyncConnectedState => ({
  organizationId: null,
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
  organizationId: OrgId | null;
  setControlCalls: XSyncControlState[];
  controlStatus: Status | null;
  controlSyncEnabled: boolean | null;
  pollControl: XSyncPollControl;
  setPollControlCalls: XSyncPollControl[];
  reconnectReason: XSyncReconnectReason;
  setReconnectReasonCalls: XSyncReconnectReason[];
  checkpoints: readonly XTweetId[];
  setCheckpointsCalls: Array<readonly XTweetId[]>;
  scan: XSyncScanState | null;
  setScanCalls: XSyncScanState[];
  clearScanCalls: number;
  readUsage: XSyncReadUsage | null;
  setReadUsageCalls: XSyncReadUsage[];
}

const pendingSnapshot = (rec: StoreRec): XSyncStateSnapshot | null => {
  if (
    !rec.organizationId &&
    rec.controlStatus === null &&
    rec.controlSyncEnabled === null
  ) {
    return null;
  }
  return {
    organizationId: rec.organizationId,
    xUserId: null,
    xUsername: null,
    watermarkTweetId: null,
    status: rec.controlStatus ?? "active",
    syncEnabled: rec.controlSyncEnabled ?? true,
  };
};

const currentSnapshot = (rec: StoreRec): XSyncStateSnapshot | null => {
  if (!rec.snapshot) return pendingSnapshot(rec);
  return {
    ...rec.snapshot,
    organizationId: rec.organizationId ?? rec.snapshot.organizationId,
    status: rec.controlStatus ?? rec.snapshot.status,
    syncEnabled: rec.controlSyncEnabled ?? rec.snapshot.syncEnabled,
  };
};

export const makeStoreLayer = (initial: XSyncStateSnapshot | null) => {
  const rec: StoreRec = {
    snapshot: initial,
    setWatermarkCalls: [],
    setStatusCalls: [],
    setSyncEnabledCalls: [],
    setIdentityCalls: 0,
    clearCalls: 0,
    organizationId: initial?.organizationId ?? null,
    setControlCalls: [],
    controlStatus: initial?.status ?? null,
    controlSyncEnabled: initial?.syncEnabled ?? null,
    pollControl: activePollControl,
    setPollControlCalls: [],
    reconnectReason: defaultReconnectReason,
    setReconnectReasonCalls: [],
    checkpoints: [],
    setCheckpointsCalls: [],
    scan: null,
    setScanCalls: [],
    clearScanCalls: 0,
    readUsage: null,
    setReadUsageCalls: [],
  };
  const layer = Layer.succeed(XSyncStateStore, {
    read: () => Effect.sync(() => currentSnapshot(rec)),
    setIdentity: (identity) =>
      Effect.sync(() => {
        rec.setIdentityCalls += 1;
        rec.snapshot = {
          ...identity,
          organizationId: rec.organizationId,
          watermarkTweetId: rec.snapshot?.watermarkTweetId ?? null,
          status: rec.controlStatus ?? rec.snapshot?.status ?? "active",
          syncEnabled:
            rec.controlSyncEnabled ?? rec.snapshot?.syncEnabled ?? true,
        };
      }),
    setWatermark: (tweetId) =>
      Effect.sync(() => {
        rec.setWatermarkCalls.push(tweetId);
        if (rec.snapshot) {
          rec.snapshot = { ...rec.snapshot, watermarkTweetId: tweetId };
        }
      }),
    readCheckpoints: () => Effect.sync(() => rec.checkpoints),
    setCheckpoints: (tweetIds) =>
      Effect.sync(() => {
        rec.checkpoints = [...tweetIds];
        rec.setCheckpointsCalls.push([...tweetIds]);
      }),
    readScan: () => Effect.sync(() => rec.scan),
    setScan: (scan) =>
      Effect.sync(() => {
        rec.scan = scan;
        rec.setScanCalls.push(scan);
      }),
    clearScan: () =>
      Effect.sync(() => {
        rec.scan = null;
        rec.clearScanCalls += 1;
      }),
    readReadUsage: () => Effect.sync(() => rec.readUsage),
    setReadUsage: (usage) =>
      Effect.sync(() => {
        rec.readUsage = usage;
        rec.setReadUsageCalls.push(usage);
      }),
    setStatus: (status) =>
      Effect.sync(() => {
        rec.setStatusCalls.push(status);
        rec.controlStatus = status;
        if (rec.snapshot) rec.snapshot = { ...rec.snapshot, status };
      }),
    setSyncEnabled: (enabled) =>
      Effect.sync(() => {
        rec.setSyncEnabledCalls.push(enabled);
        rec.controlSyncEnabled = enabled;
        if (rec.snapshot) {
          rec.snapshot = { ...rec.snapshot, syncEnabled: enabled };
        }
      }),
    setControl: (control) =>
      Effect.sync(() => {
        rec.setControlCalls.push(control);
        rec.organizationId = control.organizationId;
        rec.controlStatus = control.status;
        if (rec.snapshot) {
          rec.snapshot = {
            ...rec.snapshot,
            organizationId: control.organizationId,
            status: control.status,
          };
        }
      }),
    readPollControl: () => Effect.sync(() => rec.pollControl),
    setPollControl: (control) =>
      Effect.sync(() => {
        rec.pollControl = control;
        rec.setPollControlCalls.push(control);
      }),
    readReconnectReason: () => Effect.sync(() => rec.reconnectReason),
    setReconnectReason: (reason) =>
      Effect.sync(() => {
        rec.reconnectReason = reason;
        rec.setReconnectReasonCalls.push(reason);
      }),
    clear: () =>
      Effect.sync(() => {
        rec.clearCalls += 1;
        rec.snapshot = null;
        rec.organizationId = null;
        rec.controlStatus = null;
        rec.controlSyncEnabled = null;
        rec.pollControl = activePollControl;
        rec.reconnectReason = defaultReconnectReason;
        rec.checkpoints = [];
        rec.scan = null;
        rec.readUsage = null;
      }),
  });
  return { layer, rec };
};

export interface AccountRec {
  findAccountCalls: UserId[];
  getAccessTokenCalls: Array<{ userId: UserId; accountId: string }>;
  getOrganizationIdCalls: UserId[];
  capabilitiesCalls: OrgId[];
}

export const makeAccountLayer = (
  options: {
    linked?: boolean;
    accessToken?: string;
    organizationId?: OrgId | null;
    entitled?: boolean;
    missingOrgIds?: ReadonlySet<string>;
  } = {}
) => {
  const rec: AccountRec = {
    findAccountCalls: [],
    getAccessTokenCalls: [],
    getOrganizationIdCalls: [],
    capabilitiesCalls: [],
  };
  const layer = Layer.succeed(XSyncAccountRepository, {
    findAccount: (userId) =>
      Effect.sync(() => {
        rec.findAccountCalls.push(userId);
        if (options.linked === false) return null;
        return { id: "x-account-row-1" };
      }),
    getAccessToken: (userId, accountId) =>
      Effect.sync(() => {
        rec.getAccessTokenCalls.push({ userId, accountId });
        return options.accessToken ?? "tok-1";
      }),
    getOrganizationId: (userId) =>
      Effect.sync(() => {
        rec.getOrganizationIdCalls.push(userId);
        if (options.organizationId === undefined) return ORG_ID;
        return options.organizationId;
      }),
    capabilities: (organizationId) =>
      Effect.sync(() => {
        rec.capabilitiesCalls.push(organizationId);
        if (options.missingOrgIds?.has(organizationId)) return Option.none();
        return Option.some({
          ...TIER_CAPABILITIES.pro,
          xBookmarkSync: options.entitled ?? true,
        });
      }),
    usageWindow: () => Effect.succeed(Option.some(USAGE_WINDOW)),
  });
  return { layer, rec };
};

export interface AlarmRec {
  alarmScheduled: boolean;
  ensureWrites: number;
  ensureDelays: number[];
  cancelWrites: number;
  scheduleWrites: number;
  scheduleDelays: number[];
}

export const makeAlarmLayer = (initiallyScheduled = false) => {
  const rec: AlarmRec = {
    alarmScheduled: initiallyScheduled,
    ensureWrites: 0,
    ensureDelays: [],
    cancelWrites: 0,
    scheduleWrites: 0,
    scheduleDelays: [],
  };
  const layer = Layer.succeed(XSyncAlarm, {
    cancel: () =>
      Effect.sync(() => {
        if (!rec.alarmScheduled) return;
        rec.alarmScheduled = false;
        rec.cancelWrites += 1;
      }),
    ensureAfter: (delay) =>
      Effect.sync(() => {
        if (rec.alarmScheduled) return;
        rec.alarmScheduled = true;
        rec.ensureWrites += 1;
        rec.ensureDelays.push(delay);
      }),
    scheduleAfter: (delay) =>
      Effect.sync(() => {
        rec.alarmScheduled = true;
        rec.scheduleWrites += 1;
        rec.scheduleDelays.push(delay);
      }),
  });
  return { layer, rec };
};

export type ScriptedBookmarksResponse =
  | { kind: "ok"; page: BookmarksPage }
  | { kind: "fail"; error: XApiFailure };

export const makeXApiLayer = (responses: ScriptedBookmarksResponse[]) => {
  const calls: Array<{ maxResults: number; paginationToken?: string }> = [];
  const remaining = [...responses];
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
      const response = remaining.shift();
      if (!response) {
        return Effect.die(`no scripted response for call ${calls.length}`);
      }
      if (response.kind === "fail") return Effect.fail(response.error);
      return Effect.succeed(response.page);
    },
  });
  return { layer, calls };
};

export const makeQueueLayer = (
  options: {
    readonly failAtCalls?: ReadonlySet<number>;
    readonly limitAtCalls?: ReadonlySet<number>;
    readonly duplicateAtCalls?: ReadonlySet<number>;
  } = {}
) => {
  const calls: LinkQueueMessage[] = [];
  const settledTweetIds = new Set<string>();
  const layer = Layer.succeed(LinkQueueClient, {
    send: (input) =>
      Effect.gen(function* () {
        const callIndex = calls.length;
        calls.push(input.message);
        if (options.failAtCalls?.has(callIndex)) {
          return yield* new XSyncSideEffectError({
            op: "LINK_QUEUE.send",
            cause: new Error(`scripted queue failure at call ${callIndex}`),
          });
        }
        if (options.limitAtCalls?.has(callIndex)) return "limit_reached";
        if (options.duplicateAtCalls?.has(callIndex)) return "duplicate";
        if (settledTweetIds.has(input.tweetId)) return "duplicate";
        settledTweetIds.add(input.tweetId);
        return "enqueued";
      }),
  });
  return { layer, calls };
};

export const baseLayers = (
  store: Layer.Layer<XSyncStateStore>,
  x: Layer.Layer<XApiClient>,
  queue: Layer.Layer<LinkQueueClient>
) => Layer.mergeAll(store, x, queue, OtelTracingLive);
