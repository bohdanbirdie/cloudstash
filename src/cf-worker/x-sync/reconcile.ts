import { Effect, Option } from "effect";

import { OrgId, UserId, XUserId, XUsername } from "../db/branded";
import { maskId } from "../log-utils";
import { XSyncAccountRepository } from "./account";
import type { XApiFailure } from "./errors";
import { POLL_INTERVAL_MS } from "./poll";
import { XApiClient } from "./services";
import { XSyncAlarm } from "./services/x-sync-alarm";
import type {
  Status,
  XSyncConnectedState,
  XSyncStateSnapshot,
} from "./services/x-sync-state-store";
import { XSyncStateStore } from "./services/x-sync-state-store";

const logInitializationFailure = Effect.fnUntraced(function* (
  userId: UserId,
  xUserId: XUserId,
  error: XApiFailure
) {
  return yield* Effect.logWarning("initializeWatermark: X request failed").pipe(
    Effect.annotateLogs({
      userId: maskId(userId),
      xUserId: maskId(xUserId),
      endpoint: error.endpoint,
      errorTag: error._tag,
    })
  );
});

export const initializeWatermarkEffect = Effect.fn(
  "XBookmarkSyncDO.initializeWatermark"
)(function* (userId: UserId, accessToken: string) {
  yield* Effect.annotateCurrentSpan("userId", maskId(userId));
  const store = yield* XSyncStateStore;
  const state = yield* store.read();
  if (!state || !state.xUserId) return;

  const api = yield* XApiClient;
  const page = yield* api
    .getBookmarks({
      xUserId: state.xUserId,
      accessToken,
      maxResults: 1,
    })
    .pipe(
      Effect.tapError((error) =>
        logInitializationFailure(userId, state.xUserId, error)
      ),
      Effect.option
    );
  if (Option.isNone(page)) return;

  const newestId = page.value.data[0]?.id;
  if (!newestId) {
    yield* Effect.logInfo("initializeWatermark: no existing bookmarks").pipe(
      Effect.annotateLogs({
        userId: maskId(userId),
        xUserId: maskId(state.xUserId),
      })
    );
    return;
  }

  yield* store.setWatermark(newestId);
  yield* Effect.annotateCurrentSpan("watermark", newestId);
  yield* Effect.logInfo("initializeWatermark: pinned").pipe(
    Effect.annotateLogs({
      userId: maskId(userId),
      xUserId: maskId(state.xUserId),
      watermark: newestId,
    })
  );
});

const initializeSyncWithTokenEffect = Effect.fn(
  "XBookmarkSyncDO.initializeWithToken"
)(function* (userId: UserId, accessToken: string) {
  yield* Effect.annotateCurrentSpan("userId", maskId(userId));
  const store = yield* XSyncStateStore;
  const existing = yield* store.read();
  const api = yield* XApiClient;
  const me = yield* api.getMe(accessToken).pipe(
    Effect.map(Option.some),
    Effect.catchTag("XUnauthorizedError", (error) =>
      store.setStatus("needs_reconnect").pipe(
        Effect.tap(() =>
          Effect.logWarning("start: getMe unauthorized").pipe(
            Effect.annotateLogs({
              userId: maskId(userId),
              endpoint: error.endpoint,
            })
          )
        ),
        Effect.as(Option.none())
      )
    )
  );
  if (Option.isNone(me)) return false;

  yield* store.setIdentity({
    xUserId: XUserId.make(me.value.id),
    xUsername: XUsername.make(me.value.username),
  });

  const isFreshConnect = !existing?.watermarkTweetId;
  yield* Effect.annotateCurrentSpan("isFreshConnect", isFreshConnect);
  if (isFreshConnect) {
    yield* initializeWatermarkEffect(userId, accessToken);
  }
  return true;
});

interface ActiveReconcileContext {
  readonly organizationId: OrgId;
  readonly state: XSyncConnectedState;
  readonly accessToken: string;
}

const isConnectedState = (
  state: XSyncStateSnapshot | null
): state is XSyncConnectedState => state !== null && state.xUserId !== null;

const setControlEffect = Effect.fnUntraced(function* (
  state: XSyncStateSnapshot | null,
  organizationId: OrgId | null,
  status: Status
) {
  if (state?.organizationId === organizationId && state.status === status)
    return;
  const store = yield* XSyncStateStore;
  yield* store.setControl({ organizationId, status });
});

const activeStateEffect = Effect.fnUntraced(function* (
  state: XSyncStateSnapshot | null,
  organizationId: OrgId
) {
  if (isConnectedState(state)) {
    return {
      ...state,
      organizationId,
      status: "active",
    } satisfies XSyncConnectedState;
  }
  const store = yield* XSyncStateStore;
  const persisted = yield* store.read();
  if (!isConnectedState(persisted)) {
    return yield* Effect.die("X sync initialization did not persist identity");
  }
  return persisted;
});

const resolveWorkspaceEffect = Effect.fnUntraced(function* (
  userId: UserId,
  persistedOrgId: OrgId | null,
  requestedOrgId: OrgId | undefined
) {
  const repository = yield* XSyncAccountRepository;
  const organizationId =
    persistedOrgId ??
    requestedOrgId ??
    (yield* repository.getOrganizationId(userId));
  if (!organizationId) return Option.none();

  const capabilities = yield* repository.capabilities(organizationId);
  if (Option.isSome(capabilities)) {
    return Option.some({
      organizationId,
      capabilities: capabilities.value,
    });
  }

  if (requestedOrgId && requestedOrgId !== organizationId) {
    const replacement = yield* repository.capabilities(requestedOrgId);
    if (Option.isSome(replacement)) {
      return Option.some({
        organizationId: requestedOrgId,
        capabilities: replacement.value,
      });
    }
  }

  return Option.none();
});

const reconcileCoreEffect = Effect.fn("XBookmarkSyncDO.reconcileCore")(
  function* (userId: UserId, requestedOrgId: OrgId | undefined) {
    yield* Effect.annotateCurrentSpan("userId", maskId(userId));
    const store = yield* XSyncStateStore;
    const alarm = yield* XSyncAlarm;
    const repository = yield* XSyncAccountRepository;
    const [state, account] = yield* Effect.all([
      store.read(),
      repository.findAccount(userId),
    ]);

    if (!account) {
      yield* alarm.cancel();
      yield* store.clear();
      if (state) {
        yield* Effect.logInfo("reconcile: X account is not linked").pipe(
          Effect.annotateLogs({ userId: maskId(userId) })
        );
      }
      return Option.none<ActiveReconcileContext>();
    }

    const workspace = yield* resolveWorkspaceEffect(
      userId,
      state?.organizationId ?? null,
      requestedOrgId
    );
    if (Option.isNone(workspace)) {
      yield* setControlEffect(state, null, "suspended");
      yield* alarm.cancel();
      return Option.none<ActiveReconcileContext>();
    }

    const { capabilities, organizationId } = workspace.value;
    if (!capabilities.xBookmarkSync) {
      yield* setControlEffect(state, organizationId, "suspended");
      yield* alarm.cancel();
      return Option.none<ActiveReconcileContext>();
    }

    if (state?.syncEnabled === false) {
      yield* setControlEffect(state, organizationId, "paused");
      yield* alarm.cancel();
      return Option.none<ActiveReconcileContext>();
    }

    const accessToken = yield* repository.getAccessToken(userId, account.id);
    const connected = isConnectedState(state);
    if (connected && state.status === "needs_reconnect") {
      const api = yield* XApiClient;
      const credentialValid = yield* api.getMe(accessToken).pipe(
        Effect.as(true),
        Effect.catchTag("XUnauthorizedError", () => Effect.succeed(false))
      );
      if (!credentialValid) {
        yield* setControlEffect(state, organizationId, "needs_reconnect");
        yield* alarm.cancel();
        return Option.none<ActiveReconcileContext>();
      }
    }

    if (!connected) {
      const initialized = yield* initializeSyncWithTokenEffect(
        userId,
        accessToken
      );
      if (!initialized) {
        yield* alarm.cancel();
        return Option.none<ActiveReconcileContext>();
      }
    }

    yield* setControlEffect(state, organizationId, "active");
    const activeState = yield* activeStateEffect(state, organizationId);

    if (!connected || state.status !== "active") {
      yield* Effect.logInfo("reconcile: active").pipe(
        Effect.annotateLogs({
          userId: maskId(userId),
          organizationId: maskId(organizationId),
          initialized: !connected,
        })
      );
    }
    return Option.some({
      organizationId,
      state: activeState,
      accessToken,
    } satisfies ActiveReconcileContext);
  }
);

export const reconcileSyncEffect = Effect.fn("XBookmarkSyncDO.reconcile")(
  function* (userId: UserId, requestedOrgId: OrgId | undefined) {
    const reconciled = yield* reconcileCoreEffect(userId, requestedOrgId);
    if (Option.isSome(reconciled)) {
      const alarm = yield* XSyncAlarm;
      yield* alarm.ensureAfter(POLL_INTERVAL_MS);
    }
  }
);

export const reconcileBeforePollEffect = Effect.fn(
  "XBookmarkSyncDO.reconcileBeforePoll"
)(function* (userId: UserId) {
  return yield* reconcileCoreEffect(userId, undefined);
});

export const resumeSyncEffect = Effect.fn("XBookmarkSyncDO.resume")(function* (
  userId: UserId,
  requestedOrgId: OrgId | undefined
) {
  yield* Effect.annotateCurrentSpan("userId", maskId(userId));
  const store = yield* XSyncStateStore;
  const alarm = yield* XSyncAlarm;
  const repository = yield* XSyncAccountRepository;
  const account = yield* repository.findAccount(userId);
  if (!account) {
    yield* alarm.cancel();
    yield* store.clear();
    return;
  }
  yield* store.setSyncEnabled(true);
  return yield* reconcileSyncEffect(userId, requestedOrgId);
});
