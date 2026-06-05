import { events } from "../../livestore/schema";
import { activityEvents } from "../db/schema";
import type { ActivityType } from "../db/schema";

type ActivityRow = typeof activityEvents.$inferInsert;

export interface PushEvent {
  readonly name: string;
  readonly args: unknown;
}

const LINK_EVENT_TYPE: Record<string, ActivityType> = {
  [events.linkCreated.name]: "link_saved",
  [events.linkCreatedV2.name]: "link_saved",
  [events.linkDeleted.name]: "link_deleted",
  [events.linkCompleted.name]: "link_completed",
};

const TIME_ARG: Partial<Record<ActivityType, string>> = {
  link_saved: "createdAt",
  link_deleted: "deletedAt",
  link_completed: "completedAt",
};

function toDate(value: unknown): Date {
  if (typeof value === "number") return new Date(value);
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed);
  }
  return new Date();
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function toActivityRows(
  organizationId: string,
  batch: readonly PushEvent[]
): ActivityRow[] {
  const rows: ActivityRow[] = [];
  for (const event of batch) {
    const type = LINK_EVENT_TYPE[event.name];
    if (type === undefined) continue;

    const args = (event.args ?? {}) as Record<string, unknown>;
    const linkId = asString(args.id);
    const domain = asString(args.domain);

    rows.push({
      organizationId,
      userId: null,
      type,
      source: asString(args.source),
      refId: linkId,
      meta: domain ? { domain } : null,
      occurredAt: toDate(args[TIME_ARG[type] ?? ""]),
      // dedupeKey from linkId (not seqNum) survives ServerAheadError rebases.
      dedupeKey: linkId ? `lvs:${type}:${linkId}` : null,
    });
  }
  return rows;
}
