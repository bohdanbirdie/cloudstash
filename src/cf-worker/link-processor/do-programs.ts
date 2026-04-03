import { nanoid } from "@livestore/livestore";
import { Effect } from "effect";

import { events } from "../../livestore/schema";
import { LinkId as LinkIdBrand } from "../db/branded";
import type { LinkId, OrgId } from "../db/branded";
import { maskId } from "../log-utils";
import { LinkRepository, SourceNotifier } from "./services";
import type { Link, Status } from "./services";

const STUCK_TIMEOUT_MS = 5 * 60 * 1000;

interface IngestLinkParams {
  url: string;
  storeId: OrgId;
  source: string;
  sourceMeta: string | null;
}

export const ingestLink = Effect.fn("LinkProcessor.ingestLink")(function* (
  params: IngestLinkParams
) {
  const repo = yield* LinkRepository;
  const notifier = yield* SourceNotifier;

  const domain = yield* Effect.try(() =>
    new URL(params.url).hostname.replace(/^www\./, "")
  ).pipe(
    Effect.catchAll(() =>
      Effect.logWarning("Invalid URL in queue message").pipe(
        Effect.annotateLogs({ url: params.url }),
        Effect.as(null)
      )
    )
  );
  if (domain === null) {
    return { status: "invalid_url" as const };
  }

  const existing = yield* repo.findByUrl(params.url);
  if (existing) {
    yield* Effect.logInfo("Duplicate link from queue").pipe(
      Effect.annotateLogs({
        existingId: existing.id,
        storeId: maskId(params.storeId),
      })
    );
    yield* notifier.reply(
      { source: params.source, sourceMeta: params.sourceMeta },
      "Link already saved."
    );
    return { status: "duplicate" as const, linkId: existing.id };
  }

  const linkId = LinkIdBrand.make(nanoid());
  yield* Effect.logInfo("Ingesting link from queue").pipe(
    Effect.annotateLogs({
      linkId,
      source: params.source,
      storeId: maskId(params.storeId),
    })
  );

  yield* repo.commitEvent(
    events.linkCreatedV2({
      createdAt: new Date(),
      domain,
      id: linkId,
      source: params.source,
      sourceMeta: params.sourceMeta,
      url: params.url,
    })
  );

  yield* notifier.streamProgress(
    { source: params.source, sourceMeta: params.sourceMeta },
    "Fetching metadata"
  );

  return { status: "ingested" as const, linkId };
});

export const cancelStaleLinks = Effect.fn("LinkProcessor.cancelStaleLinks")(
  function* (currentlyProcessing: ReadonlySet<string>, now: number) {
    const repo = yield* LinkRepository;

    const links = yield* repo.queryActiveLinks();
    const statuses = yield* repo.queryStatuses();
    const statusMap = new Map(statuses.map((s) => [s.linkId, s]));

    let cancelled = 0;
    for (const link of links) {
      if (currentlyProcessing.has(link.id)) continue;

      const status = statusMap.get(link.id);
      if (
        status?.status === "completed" ||
        status?.status === "cancelled" ||
        status?.status === "failed"
      )
        continue;

      const updatedAt = status
        ? new Date(status.updatedAt).getTime()
        : new Date(link.createdAt).getTime();
      if (now - updatedAt <= STUCK_TIMEOUT_MS) continue;

      yield* repo.commitEvent(
        events.linkProcessingCancelled({
          linkId: link.id,
          updatedAt: new Date(now),
        })
      );
      cancelled++;
    }

    if (cancelled > 0) {
      yield* Effect.logInfo("Cancelled stale links on startup").pipe(
        Effect.annotateLogs({ cancelled })
      );
    }

    return cancelled;
  }
);

export interface NotifyResultParams {
  linkId: LinkId;
  processingStatus: "completed" | "failed";
  source: string;
  sourceMeta: string | null;
  summary: string | null;
  suggestedTags: string[];
}

export const notifyResult = Effect.fn("LinkProcessor.notifyResult")(function* (
  result: NotifyResultParams
) {
  const notifier = yield* SourceNotifier;
  const repo = yield* LinkRepository;

  yield* Effect.logInfo("Notifying source").pipe(
    Effect.annotateLogs({
      linkId: result.linkId,
      source: result.source,
      status: result.processingStatus,
    })
  );

  yield* notifier.finalizeProgress(
    { source: result.source, sourceMeta: result.sourceMeta },
    {
      processingStatus: result.processingStatus,
      summary: result.summary,
      suggestedTags: result.suggestedTags,
    }
  );

  yield* repo.commitEvent(
    events.linkSourceNotified({
      linkId: result.linkId,
      notifiedAt: new Date(),
    })
  );
});

interface StuckLinkEvent {
  linkId: LinkId;
  stuckMs: number;
}

export const detectStuckLinks = (
  pendingLinks: readonly Link[],
  statuses: readonly Status[],
  currentlyProcessing: ReadonlySet<string>,
  now: number
): StuckLinkEvent[] => {
  const statusMap = new Map(statuses.map((s) => [s.linkId, s]));
  const stuck: StuckLinkEvent[] = [];

  for (const link of pendingLinks) {
    if (currentlyProcessing.has(link.id)) continue;

    const existingStatus = statusMap.get(link.id);
    if (!existingStatus || existingStatus.status !== "pending") continue;

    const elapsed = now - new Date(existingStatus.updatedAt).getTime();
    if (elapsed > STUCK_TIMEOUT_MS) {
      stuck.push({ linkId: LinkIdBrand.make(link.id), stuckMs: elapsed });
    }
  }

  return stuck;
};
