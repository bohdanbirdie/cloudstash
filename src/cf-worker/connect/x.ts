import { Effect, Layer } from "effect";

import { AppLayerLive, AuthClient } from "../auth/service";
import { capabilityDeniedResponse } from "../billing/errors";
import { requireCapability } from "../billing/service";
import { OrgId, UserId } from "../db/branded";
import { maskId, safeErrorInfo } from "../log-utils";
import type { Env } from "../shared";
import type {
  XBookmarkSyncDO,
  XStatusResponse,
} from "../x-sync/durable-object";
import { sideEffectError } from "../x-sync/effects-helpers";
import {
  ConnectUnauthorizedError,
  NoActiveOrgError,
  SessionLookupError,
} from "./errors";
import { SessionProvider } from "./services";

type ActionResult = { ok: true } | { kind: "not_connected" };

const requireSession = Effect.fn("XConnect.requireSession")(function* (
  headers: Headers
) {
  const sessionProvider = yield* SessionProvider;
  const session = yield* sessionProvider
    .getSession(headers)
    .pipe(
      Effect.flatMap((s) =>
        s ? Effect.succeed(s) : new ConnectUnauthorizedError()
      )
    );
  yield* Effect.annotateCurrentSpan("userId", maskId(session.userId));
  return session.userId;
});

// Encapsulates "call a method on the X DO stub with side-effect-error
// handling + tracing." All four request handlers go through this — keeps
// connect/x.ts free of the env/idFromName/get pattern repeated per call.
const callDO = <A>(
  env: Env,
  userId: UserId,
  spanName: string,
  op: string,
  fn: (stub: DurableObjectStub<XBookmarkSyncDO>) => Promise<A>
) =>
  Effect.tryPromise({
    try: () =>
      fn(env.X_BOOKMARK_SYNC_DO.get(env.X_BOOKMARK_SYNC_DO.idFromName(userId))),
    catch: sideEffectError(op),
  }).pipe(
    Effect.withSpan(spanName, { attributes: { userId: maskId(userId) } })
  );

const safeStatus = (env: Env, userId: UserId) =>
  callDO(
    env,
    userId,
    "XBookmarkSyncDO.rpc.status",
    "DO.status",
    (stub) => stub.status() as Promise<XStatusResponse>
  ).pipe(
    Effect.catchTag("XSyncSideEffectError", (e) =>
      Effect.logWarning("X RPC: status failed").pipe(
        Effect.annotateLogs({ userId: maskId(userId), cause: String(e.cause) }),
        Effect.as({ connected: false } satisfies XStatusResponse)
      )
    )
  );

export const xStatusRequest = Effect.fn("XConnect.status")(function* (
  headers: Headers,
  env: Env
) {
  const userId = yield* requireSession(headers);
  return yield* safeStatus(env, userId);
});

export const xDisconnectRequest = Effect.fn("XConnect.disconnect")(function* (
  request: Request,
  env: Env
) {
  const userId = yield* requireSession(request.headers);
  const auth = yield* AuthClient;

  // Stop the DO first so no more polls fire during teardown.
  yield* callDO(
    env,
    userId,
    "XBookmarkSyncDO.rpc.disconnect",
    "DO.disconnect",
    (stub) => stub.disconnect()
  ).pipe(
    Effect.catchTag("XSyncSideEffectError", (e) =>
      Effect.logWarning("X disconnect: DO stub.disconnect() failed").pipe(
        Effect.annotateLogs({ userId: maskId(userId), cause: String(e.cause) })
      )
    )
  );

  // Better Auth unlink — tolerate "already unlinked" cases.
  yield* Effect.tryPromise({
    try: () =>
      auth.api.unlinkAccount({
        body: { providerId: "x" },
        headers: request.headers,
      }),
    catch: sideEffectError("auth.unlinkAccount"),
  }).pipe(
    Effect.catchTag("XSyncSideEffectError", (e) =>
      Effect.logWarning("X disconnect: unlinkAccount failed").pipe(
        Effect.annotateLogs({ userId: maskId(userId), cause: String(e.cause) })
      )
    ),
    Effect.withSpan("XConnect.unlinkAccount", {
      attributes: { userId: maskId(userId) },
    })
  );

  yield* Effect.logInfo("X disconnect complete").pipe(
    Effect.annotateLogs({ userId: maskId(userId) })
  );

  return { ok: true } satisfies ActionResult;
});

export const xPauseRequest = Effect.fn("XConnect.pause")(function* (
  request: Request,
  env: Env
) {
  const userId = yield* requireSession(request.headers);

  // Check current status before pausing — surfaces a 404 if user isn't
  // connected at all (DO storage is empty).
  const status = yield* safeStatus(env, userId);
  if (!status.connected) {
    return { kind: "not_connected" } satisfies ActionResult;
  }

  yield* callDO(env, userId, "XBookmarkSyncDO.rpc.pause", "DO.pause", (stub) =>
    stub.pause()
  ).pipe(
    Effect.catchTag("XSyncSideEffectError", (e) =>
      Effect.logWarning("X pause: DO stub.pause() failed").pipe(
        Effect.annotateLogs({ userId: maskId(userId), cause: String(e.cause) })
      )
    )
  );

  return { ok: true } satisfies ActionResult;
});

export const xResumeRequest = Effect.fn("XConnect.resume")(function* (
  request: Request,
  env: Env
) {
  const sessionProvider = yield* SessionProvider;
  const session = yield* sessionProvider
    .getSession(request.headers)
    .pipe(
      Effect.flatMap((s) =>
        s ? Effect.succeed(s) : new ConnectUnauthorizedError()
      )
    );
  const { userId, orgId } = session;
  yield* Effect.annotateCurrentSpan("userId", maskId(userId));
  if (!orgId) {
    return yield* new NoActiveOrgError({ userId });
  }
  yield* requireCapability(orgId, "xBookmarkSync");

  const status = yield* safeStatus(env, userId);
  if (!status.connected) {
    return { kind: "not_connected" } satisfies ActionResult;
  }

  yield* callDO(
    env,
    userId,
    "XBookmarkSyncDO.rpc.resume",
    "DO.resume",
    (stub) => stub.resume()
  ).pipe(
    Effect.catchTag("XSyncSideEffectError", (e) =>
      Effect.logWarning("X resume: DO stub.resume() failed").pipe(
        Effect.annotateLogs({ userId: maskId(userId), cause: String(e.cause) })
      )
    )
  );

  return { ok: true } satisfies ActionResult;
});

const SessionProviderLive = Layer.effect(
  SessionProvider,
  Effect.gen(function* () {
    const auth = yield* AuthClient;
    return SessionProvider.of({
      getSession: (headers) =>
        Effect.tryPromise({
          catch: (cause) => new SessionLookupError({ cause }),
          try: () => auth.api.getSession({ headers }),
        }).pipe(
          Effect.map((session) =>
            session?.session
              ? {
                  userId: UserId.make(session.user.id),
                  orgId: session.session.activeOrganizationId
                    ? OrgId.make(session.session.activeOrganizationId)
                    : null,
                }
              : null
          )
        ),
    });
  })
);

const makeLiveLayer = (env: Env) =>
  SessionProviderLive.pipe(Layer.provideMerge(AppLayerLive(env)));

const unexpected500 = (cause: unknown): Effect.Effect<Response> =>
  Effect.logError("X connect handler crashed").pipe(
    Effect.annotateLogs(safeErrorInfo(cause)),
    Effect.as(Response.json({ error: "Internal error" }, { status: 500 }))
  );

const mapActionResult = (data: ActionResult): Response =>
  "ok" in data
    ? Response.json(data)
    : Response.json({ error: "Not connected" }, { status: 404 });

const commonErrorTags = {
  ConnectUnauthorizedError: () =>
    Effect.succeed(Response.json({ error: "Unauthorized" }, { status: 401 })),
  SessionLookupError: () =>
    Effect.succeed(
      Response.json({ error: "Auth backend unavailable" }, { status: 503 })
    ),
} as const;

export const handleXStatus = (request: Request, env: Env): Promise<Response> =>
  Effect.runPromise(
    xStatusRequest(request.headers, env).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags(commonErrorTags),
      Effect.catchAllCause((cause) => unexpected500(cause))
    )
  );

export const handleXDisconnect = (
  request: Request,
  env: Env
): Promise<Response> =>
  Effect.runPromise(
    xDisconnectRequest(request, env).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map((data) => Response.json(data)),
      Effect.catchTags(commonErrorTags),
      Effect.catchAllCause((cause) => unexpected500(cause))
    )
  );

export const handleXPause = (request: Request, env: Env): Promise<Response> =>
  Effect.runPromise(
    xPauseRequest(request, env).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map(mapActionResult),
      Effect.catchTags(commonErrorTags),
      Effect.catchAllCause((cause) => unexpected500(cause))
    )
  );

export const handleXResume = (request: Request, env: Env): Promise<Response> =>
  Effect.runPromise(
    xResumeRequest(request, env).pipe(
      Effect.provide(makeLiveLayer(env)),
      Effect.map(mapActionResult),
      Effect.catchTags({
        ...commonErrorTags,
        CapabilityDisabledError: (e) =>
          Effect.succeed(capabilityDeniedResponse(e)),
        NoActiveOrgError: () =>
          Effect.succeed(
            Response.json({ error: "No active organization" }, { status: 400 })
          ),
        OrgNotFoundError: () =>
          Effect.succeed(
            Response.json({ error: "Organization not found" }, { status: 404 })
          ),
        DbError: (cause) => unexpected500(cause),
      }),
      Effect.catchAllCause((cause) => unexpected500(cause))
    )
  );
