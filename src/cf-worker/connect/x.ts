import { Effect, Layer } from "effect";

import { AppLayerLive, AuthClient } from "../auth/service";
import { WorkspaceAccess } from "../auth/workspace-access";
import { capabilityDeniedResponse } from "../billing/errors";
import { Billing, requireCapability } from "../billing/service";
import { DbError } from "../db/service";
import { maskId, safeErrorInfo } from "../log-utils";
import { provideResponse } from "../runtime";
import type { Env } from "../shared";
import { XSyncSideEffectError } from "../x-sync/errors";
import { XSyncControl } from "../x-sync/services/x-sync-control";
import {
  ConnectUnauthorizedError,
  NoActiveOrgError,
  SessionLookupError,
} from "./errors";
import { SessionProvider, getAuthorizedSession } from "./services";

type ActionResult = { ok: true } | { kind: "not_connected" };

const returnTarget = (request: Request): URL => {
  const requestUrl = new URL(request.url);
  const candidate = requestUrl.searchParams.get("returnTo");
  if (!candidate) return new URL("/", requestUrl.origin);
  if (!candidate.startsWith("/")) return new URL("/", requestUrl.origin);
  if (candidate.startsWith("//")) return new URL("/", requestUrl.origin);
  if (candidate.includes("\\")) return new URL("/", requestUrl.origin);
  return new URL(candidate, requestUrl.origin);
};

const connectedReturnTarget = (request: Request): URL => {
  const target = returnTarget(request);
  target.searchParams.set("integrationResult", "x-connected");
  return target;
};

const requireAuthorizedSession = Effect.fn("XConnect.requireSession")(
  function* (headers: Headers) {
    const sessionProvider = yield* SessionProvider;
    const session = yield* sessionProvider.getSession(headers);
    if (!session) return yield* new ConnectUnauthorizedError();
    yield* Effect.annotateCurrentSpan("userId", maskId(session.userId));
    return session;
  }
);

const requireSession = Effect.fnUntraced(function* (headers: Headers) {
  return (yield* requireAuthorizedSession(headers)).userId;
});

export const xStatusRequest = Effect.fnUntraced(function* (headers: Headers) {
  const userId = yield* requireSession(headers);
  const control = yield* XSyncControl;
  return yield* control.status(userId);
});

export const xDisconnectRequest = Effect.fnUntraced(function* (
  request: Request
) {
  const userId = yield* requireSession(request.headers);
  const auth = yield* AuthClient;
  const control = yield* XSyncControl;
  const accounts = yield* Effect.tryPromise({
    try: () => auth.api.listUserAccounts({ headers: request.headers }),
    catch: (cause) =>
      new XSyncSideEffectError({ op: "auth.listUserAccounts", cause }),
  });
  const xAccount = accounts.find((account) => account.providerId === "x");

  if (xAccount) {
    yield* Effect.tryPromise({
      try: () =>
        auth.api.unlinkAccount({
          body: { accountId: xAccount.id },
          headers: request.headers,
        }),
      catch: (cause) =>
        new XSyncSideEffectError({ op: "auth.unlinkAccount", cause }),
    });
  }

  yield* control.disconnect(userId);
  yield* Effect.logInfo("X disconnect complete").pipe(
    Effect.annotateLogs({ userId: maskId(userId) })
  );
  return { ok: true } satisfies ActionResult;
});

export const xPauseRequest = Effect.fnUntraced(function* (request: Request) {
  const userId = yield* requireSession(request.headers);
  const control = yield* XSyncControl;
  const status = yield* control.status(userId);
  if (!status.connected) {
    return { kind: "not_connected" } satisfies ActionResult;
  }

  yield* control.pause(userId);
  return { ok: true } satisfies ActionResult;
});

export const xResumeRequest = Effect.fnUntraced(function* (request: Request) {
  const { userId, orgId } = yield* requireAuthorizedSession(request.headers);
  if (!orgId) return yield* new NoActiveOrgError({ userId });
  yield* requireCapability(orgId, "xBookmarkSync");

  const control = yield* XSyncControl;
  const status = yield* control.status(userId);
  if (!status.connected) {
    return { kind: "not_connected" } satisfies ActionResult;
  }

  yield* control.resume(userId, orgId);
  return { ok: true } satisfies ActionResult;
});

export const xCompleteRequest = Effect.fnUntraced(function* (request: Request) {
  const { userId, orgId } = yield* requireAuthorizedSession(request.headers);
  if (!orgId) return yield* new NoActiveOrgError({ userId });

  const control = yield* XSyncControl;
  yield* control.reconcile(userId, orgId);
  yield* Effect.logInfo("X connection reconciled").pipe(
    Effect.annotateLogs({
      userId: maskId(userId),
      orgId: maskId(orgId),
    })
  );
  return Response.redirect(connectedReturnTarget(request), 303);
});

const SessionProviderLive = Layer.effect(
  SessionProvider,
  Effect.gen(function* () {
    const workspaceAccess = yield* WorkspaceAccess;
    return SessionProvider.of({
      getSession: (headers) => getAuthorizedSession(workspaceAccess, headers),
    });
  })
);

const makeLiveLayer = (env: Env) =>
  Layer.mergeAll(
    SessionProviderLive,
    XSyncControl.layer(env.X_BOOKMARK_SYNC_DO)
  ).pipe(Layer.provideMerge(AppLayerLive(env)));

const unexpected500 = (cause: unknown): Effect.Effect<Response> =>
  Effect.logError("X connect handler crashed").pipe(
    Effect.annotateLogs(safeErrorInfo(cause)),
    Effect.as(Response.json({ error: "Internal error" }, { status: 500 }))
  );

const unavailable = (error: XSyncSideEffectError): Effect.Effect<Response> =>
  Effect.logError("X synchronization unavailable").pipe(
    Effect.annotateLogs(safeErrorInfo(error)),
    Effect.as(
      Response.json(
        { error: "X synchronization is temporarily unavailable" },
        { status: 503 }
      )
    )
  );

const mapActionResult = (data: ActionResult): Response => {
  if ("ok" in data) return Response.json(data);
  return Response.json({ error: "Not connected" }, { status: 404 });
};

const expectedErrorTags = {
  ConnectUnauthorizedError: () =>
    Effect.succeed(Response.json({ error: "Unauthorized" }, { status: 401 })),
} as const;

type XConnectRequirements =
  | SessionProvider
  | AuthClient
  | Billing
  | XSyncControl;

const runXHandler = (
  effect: Effect.Effect<
    Response,
    SessionLookupError | DbError,
    XConnectRequirements
  >,
  env: Env,
  spanName: string
): Promise<Response> =>
  Effect.runPromise(
    provideResponse(
      effect.pipe(
        Effect.withSpan(spanName),
        Effect.catchTags({
          DbError: unexpected500,
          SessionLookupError: (error) =>
            Effect.logError("X connect: auth backend unavailable").pipe(
              Effect.annotateLogs(safeErrorInfo(error)),
              Effect.as(
                Response.json(
                  { error: "Auth backend unavailable" },
                  { status: 503 }
                )
              )
            ),
        })
      ),
      makeLiveLayer(env),
      unexpected500
    )
  );

export const handleXComplete = (
  request: Request,
  env: Env
): Promise<Response> =>
  runXHandler(
    xCompleteRequest(request).pipe(
      Effect.catch((error) =>
        Effect.logWarning("X completion reconciliation failed").pipe(
          Effect.annotateLogs(safeErrorInfo(error)),
          Effect.as(Response.redirect(returnTarget(request), 303))
        )
      )
    ),
    env,
    "XConnect.complete"
  );

export const handleXStatus = (request: Request, env: Env): Promise<Response> =>
  runXHandler(
    xStatusRequest(request.headers).pipe(
      Effect.map((status) => Response.json(status)),
      Effect.catchTags({
        ...expectedErrorTags,
        XSyncSideEffectError: unavailable,
      })
    ),
    env,
    "XConnect.status"
  );

export const handleXDisconnect = (
  request: Request,
  env: Env
): Promise<Response> =>
  runXHandler(
    xDisconnectRequest(request).pipe(
      Effect.map((result) => Response.json(result)),
      Effect.catchTags({
        ...expectedErrorTags,
        XSyncSideEffectError: unavailable,
      })
    ),
    env,
    "XConnect.disconnect"
  );

export const handleXPause = (request: Request, env: Env): Promise<Response> =>
  runXHandler(
    xPauseRequest(request).pipe(
      Effect.map(mapActionResult),
      Effect.catchTags({
        ...expectedErrorTags,
        XSyncSideEffectError: unavailable,
      })
    ),
    env,
    "XConnect.pause"
  );

export const handleXResume = (request: Request, env: Env): Promise<Response> =>
  runXHandler(
    xResumeRequest(request).pipe(
      Effect.map(mapActionResult),
      Effect.catchTags({
        ...expectedErrorTags,
        CapabilityDisabledError: (error) =>
          Effect.succeed(capabilityDeniedResponse(error)),
        NoActiveOrgError: () =>
          Effect.succeed(
            Response.json({ error: "No active organization" }, { status: 400 })
          ),
        XSyncSideEffectError: unavailable,
        OrgNotFoundError: () =>
          Effect.succeed(
            Response.json({ error: "Organization not found" }, { status: 404 })
          ),
      })
    ),
    env,
    "XConnect.resume"
  );
