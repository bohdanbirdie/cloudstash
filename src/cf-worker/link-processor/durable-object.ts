import {
  createStoreDoPromise,
  type ClientDoWithRpcCallback,
} from "@livestore/adapter-cloudflare";
import {
  computed,
  nanoid,
  queryDb,
  type Store,
  type Unsubscribe,
} from "@livestore/livestore";
import { handleSyncUpdateRpc } from "@livestore/sync-cf/client";
/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { Effect } from "effect";

import { events, schema, tables } from "../../livestore/schema";
import { createDb } from "../db";
import { organization, type OrgFeatures } from "../db/schema";
import { logSync } from "../logger";
import { type Env } from "../shared";
import { InvalidUrlError } from "./errors";
import { runEffect } from "./logger";
import { processLink } from "./process-link";

const logger = logSync("LinkProcessorDO");

type Link = typeof tables.links.Type;

export class LinkProcessorDO
  extends DurableObject<Env>
  implements ClientDoWithRpcCallback
{
  __DURABLE_OBJECT_BRAND = "link-processor-do" as never;

  private storeId: string | undefined;
  private cachedStore: Store<typeof schema> | undefined;
  private subscription: Unsubscribe | undefined;
  private currentlyProcessing = new Set<string>();

  /** Persisted session ID enables delta sync (only fetch missing events on wakeup) */
  private async getSessionId(): Promise<string> {
    const stored = await this.ctx.storage.get<string>("sessionId");
    if (stored) {
      return stored;
    }

    const newSessionId = nanoid();
    await this.ctx.storage.put("sessionId", newSessionId);
    return newSessionId;
  }

  private async getStore(): Promise<Store<typeof schema>> {
    if (this.cachedStore) {
      return this.cachedStore;
    }

    if (!this.storeId) {
      throw new Error("storeId not set");
    }

    const sessionId = await this.getSessionId();
    logger.info("Creating store", { sessionId, storeId: this.storeId });

    this.cachedStore = await createStoreDoPromise({
      clientId: "link-processor-do",
      durableObject: {
        bindingName: "LINK_PROCESSOR_DO",
        ctx: this.ctx,
        env: this.env,
      } as never,
      livePull: true,
      schema,
      sessionId,
      storeId: this.storeId,
      syncBackendStub: this.env.SYNC_BACKEND_DO.get(
        this.env.SYNC_BACKEND_DO.idFromName(this.storeId)
      ) as never,
    });

    return this.cachedStore;
  }

  private async getFeatures(): Promise<OrgFeatures> {
    if (!this.storeId) return {};

    const db = createDb(this.env.DB);
    const org = await db.query.organization.findFirst({
      where: eq(organization.id, this.storeId),
      columns: { features: true },
    });

    const features = org?.features ?? {};
    logger.info("Fetched features", { storeId: this.storeId, features });
    return features;
  }

  private async ensureSubscribed(): Promise<void> {
    if (this.subscription) {
      return;
    }

    const store = await this.getStore();

    const links$ = queryDb(tables.links.where({ deletedAt: null }));
    const statuses$ = queryDb(tables.linkProcessingStatus.where({}));

    const pendingLinks$ = computed(
      (get) => {
        const links = get(links$);
        const statuses = get(statuses$);
        const statusMap = new Map(statuses.map((s) => [s.linkId, s]));

        return links.filter((link) => {
          const status = statusMap.get(link.id);
          return !status || status.status === "pending";
        });
      },
      { label: "pendingLinks" }
    );

    this.subscription = store.subscribe(pendingLinks$, (pendingLinks) => {
      logger.info("Subscription fired", { pendingCount: pendingLinks.length });
      this.onPendingLinksChanged(store, pendingLinks);
    });
  }

  private onPendingLinksChanged(
    store: Store<typeof schema>,
    pendingLinks: readonly Link[]
  ): void {
    for (const link of pendingLinks) {
      if (this.currentlyProcessing.has(link.id)) {
        continue;
      }

      const existingStatus = store.query(
        queryDb(tables.linkProcessingStatus.where({ linkId: link.id }))
      );
      const isRetry =
        existingStatus.length > 0 && existingStatus[0].status === "pending";

      this.processLinkAsync(store, link, isRetry).catch((error) => {
        logger.error("processLinkAsync error", {
          error: String(error),
          linkId: link.id,
        });
      });
    }
  }

  private async processLinkAsync(
    store: Store<typeof schema>,
    link: Link,
    isRetry: boolean
  ): Promise<void> {
    this.currentlyProcessing.add(link.id);

    logger.info("Processing", { isRetry, linkId: link.id, url: link.url });

    try {
      const features = await this.getFeatures();
      await runEffect(
        processLink({
          aiSummaryEnabled: features.aiSummary ?? false,
          env: this.env,
          isRetry,
          link: { id: link.id, url: link.url },
          store,
        })
      );
    } finally {
      this.currentlyProcessing.delete(link.id);
    }
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const storeId = url.searchParams.get("storeId");
    const ingestUrl = url.searchParams.get("ingest");

    if (!storeId) {
      return new Response("Missing storeId", { status: 400 });
    }

    this.storeId = storeId;
    await this.ctx.storage.put("storeId", storeId);

    if (ingestUrl) {
      return this.handleIngest(ingestUrl);
    }

    await this.ensureSubscribed();
    return new Response("OK");
  }

  private handleIngest(url: string): Promise<Response> {
    const json = (body: object, status = 200) =>
      new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json" },
        status,
      });

    const ingest = Effect.gen(this, function* ingest() {
      const store = yield* Effect.promise(() => this.getStore());
      yield* Effect.promise(() => this.ensureSubscribed());

      const domain = yield* Effect.try({
        catch: () => new InvalidUrlError({ url }),
        try: () => new URL(url).hostname.replace(/^www\./, ""),
      });

      const existing = store.query(queryDb(tables.links.where({ url })));
      if (existing.length > 0) {
        yield* Effect.sync(() =>
          logger.info("Duplicate link", {
            existingId: existing[0].id,
            storeId: this.storeId,
            url,
          })
        );
        return json({ existingId: existing[0].id, status: "duplicate" });
      }

      const linkId = nanoid();

      yield* Effect.sync(() =>
        logger.info("Ingesting link", { linkId, storeId: this.storeId, url })
      );

      yield* Effect.sync(() =>
        store.commit(
          events.linkCreated({
            createdAt: new Date(),
            domain,
            id: linkId,
            url,
          })
        )
      );

      return json({ linkId, status: "ingested" });
    });

    return Effect.runPromise(
      ingest.pipe(
        Effect.catchTag("InvalidUrlError", () =>
          Effect.succeed(json({ error: "Invalid URL" }, 400))
        )
      )
    );
  }

  async syncUpdateRpc(payload: unknown): Promise<void> {
    if (!this.storeId) {
      this.storeId = await this.ctx.storage.get<string>("storeId");
    }

    if (this.storeId) {
      await this.ensureSubscribed();
    }

    await handleSyncUpdateRpc(payload);
  }
}
