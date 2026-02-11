import { type CfTypes } from "@livestore/sync-cf/cf-worker";
import * as SyncBackend from "@livestore/sync-cf/cf-worker";
import { Effect } from "effect";

import { createAuth, type Auth } from "../auth";
import { createDb } from "../db";
import { maskId, safeErrorInfo } from "../log-utils";
import { logSync } from "../logger";
import { type Env } from "../shared";
import {
  InvalidSessionError,
  MissingSessionCookieError,
  OrgAccessDeniedError,
} from "./errors";

const logger = logSync("SyncBackend");

// Current SyncBackendDO instance - set in constructor so it's always available
let currentSyncBackend: {
  triggerLinkProcessor: (storeId: string) => void;
} | null = null;

export class SyncBackendDO extends SyncBackend.makeDurableObject({
  onPush: async (message, context) => {
    logger.info("Push received", {
      storeId: context.storeId,
      batchSize: message.batch.length,
      events: message.batch.map((e) => e.name),
    });

    const hasLinkCreated = message.batch.some(
      (event) => event.name === "v1.LinkCreated"
    );
    if (hasLinkCreated && currentSyncBackend) {
      currentSyncBackend.triggerLinkProcessor(context.storeId);
    }
  },
}) {
  private _env: Env;

  constructor(ctx: CfTypes.DurableObjectState, env: Env) {
    super(ctx, env);
    this._env = env;
    currentSyncBackend = this;
    logger.info("DO woke up", { doId: ctx.id.toString() });
  }

  triggerLinkProcessor(storeId: string) {
    logger.info("Waking up processor", { storeId: maskId(storeId) });
    const processorId = this._env.LINK_PROCESSOR_DO.idFromName(storeId);
    const processor = this._env.LINK_PROCESSOR_DO.get(processorId);
    processor
      .fetch(`https://link-processor/?storeId=${storeId}`)
      .then(() => logger.info("Processor fetch succeeded"))
      .catch((error: unknown) =>
        logger.error("Processor fetch failed", safeErrorInfo(error))
      );
  }
}

const validatePayload = (
  _payload: unknown,
  context: { storeId: string; headers: ReadonlyMap<string, string> },
  auth: Auth
) =>
  Effect.gen(function* validatePayload() {
    const cookie = context.headers.get("cookie");
    if (!cookie) {
      logger.warn("Sync auth failed: missing cookie", {
        storeId: maskId(context.storeId),
      });
      return yield* new MissingSessionCookieError();
    }

    const session = yield* Effect.tryPromise({
      catch: () => new InvalidSessionError(),
      try: () => auth.api.getSession({ headers: new Headers({ cookie }) }),
    });

    if (!session?.session) {
      logger.warn("Sync auth failed: invalid session", {
        storeId: maskId(context.storeId),
      });
      return yield* new InvalidSessionError();
    }

    if (session.session.activeOrganizationId !== context.storeId) {
      logger.warn("Sync auth failed: org mismatch", {
        storeId: maskId(context.storeId),
        sessionOrgId: maskId(session.session.activeOrganizationId ?? "none"),
      });
      return yield* new OrgAccessDeniedError({
        sessionOrgId: session.session.activeOrganizationId ?? null,
        storeId: context.storeId,
      });
    }

    logger.debug("Sync auth OK", {
      storeId: maskId(context.storeId),
    });
  }).pipe(Effect.runPromise);

type SyncSearchParams = NonNullable<
  ReturnType<typeof SyncBackend.matchSyncRequest>
>;

export const handleSyncRequest = (
  request: CfTypes.Request,
  searchParams: SyncSearchParams,
  ctx: CfTypes.ExecutionContext,
  env: Env
) =>
  SyncBackend.handleSyncRequest({
    ctx,
    request,
    searchParams,
    syncBackendBinding: "SYNC_BACKEND_DO",
    validatePayload: (payload, context) => {
      const db = createDb(env.DB);
      const auth = createAuth(env, db);
      return validatePayload(payload, context, auth);
    },
  });

export { SyncBackend };
