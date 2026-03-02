import { nanoid } from "@livestore/livestore";
import { Effect } from "effect";

import { events } from "../../livestore/schema";
import { maskId } from "../log-utils";
import {
  LinkRepository,
  SourceNotifier,
  type Link,
  type Status,
} from "./services";

const STUCK_TIMEOUT_MS = 5 * 60 * 1000;

interface IngestLinkParams {
  url: string;
  storeId: string;
  source: string;
  sourceMeta: string | null;
}

export const ingestLink = (params: IngestLinkParams) =>
  Effect.gen(function* () {
    const repo = yield* LinkRepository;
    const notifier = yield* SourceNotifier;

    let domain: string;
    try {
      domain = new URL(params.url).hostname.replace(/^www\./, "");
    } catch {
      yield* Effect.logWarning("Invalid URL in queue message").pipe(
        Effect.annotateLogs({ url: params.url })
      );
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
      yield* notifier.react(params.source, params.sourceMeta, "👌");
      yield* notifier.reply(
        params.source,
        params.sourceMeta,
        "Link already saved."
      );
      return { status: "duplicate" as const, linkId: existing.id };
    }

    const linkId = nanoid();
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

    return { status: "ingested" as const, linkId };
  }).pipe(Effect.withSpan("ingestLink"));

export const cancelStaleLinks = (
  currentlyProcessing: ReadonlySet<string>,
  now: number
) =>
  Effect.gen(function* () {
    const repo = yield* LinkRepository;

    const links = yield* repo.queryActiveLinks();
    const statuses = yield* repo.queryStatuses();
    const statusMap = new Map(statuses.map((s) => [s.linkId, s]));

    let cancelled = 0;
    for (const link of links) {
      if (currentlyProcessing.has(link.id)) continue;

      const status = statusMap.get(link.id);
      if (status?.status === "completed" || status?.status === "cancelled")
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
  }).pipe(Effect.withSpan("cancelStaleLinks"));

interface NotifyResultParams {
  linkId: string;
  processingStatus: "completed" | "failed";
  source: string;
  sourceMeta: string | null;
}

export const notifyResult = (result: NotifyResultParams) =>
  Effect.gen(function* () {
    const notifier = yield* SourceNotifier;
    const repo = yield* LinkRepository;

    yield* Effect.logInfo("Notifying source").pipe(
      Effect.annotateLogs({
        linkId: result.linkId,
        source: result.source,
        status: result.processingStatus,
      })
    );

    const emoji = result.processingStatus === "completed" ? "👍" : "👎";
    yield* notifier.react(result.source, result.sourceMeta, emoji);

    if (result.processingStatus === "failed") {
      yield* notifier.reply(
        result.source,
        result.sourceMeta,
        "Failed to process link."
      );
    }

    yield* repo.commitEvent(
      events.linkSourceNotified({
        linkId: result.linkId,
        notifiedAt: new Date(),
      })
    );
  }).pipe(
    Effect.catchAll((error) =>
      Effect.logError("Notification failed").pipe(
        Effect.annotateLogs({
          error: String(error),
          linkId: result.linkId,
          source: result.source,
        })
      )
    ),
    Effect.withSpan("notifyResult")
  );

interface StuckLinkEvent {
  linkId: string;
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
      stuck.push({ linkId: link.id, stuckMs: elapsed });
    }
  }

  return stuck;
};
