import { events } from "../../livestore/schema";
import { activityEvents } from "../db/schema";
import type { ActivityType } from "../db/schema";

type ActivityRow = typeof activityEvents.$inferInsert;

export interface PushEvent {
  readonly name: string;
  readonly args: unknown;
}

interface LinkActivity {
  readonly type: ActivityType;
  readonly occurredAtArg: string;
}

const LINK_EVENTS: Record<string, LinkActivity> = {
  [events.linkCreated.name]: { type: "link_saved", occurredAtArg: "createdAt" },
  [events.linkCreatedV2.name]: {
    type: "link_saved",
    occurredAtArg: "createdAt",
  },
  [events.linkDeleted.name]: {
    type: "link_deleted",
    occurredAtArg: "deletedAt",
  },
  [events.linkCompleted.name]: {
    type: "link_completed",
    occurredAtArg: "completedAt",
  },
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
    const activity = LINK_EVENTS[event.name];
    if (activity === undefined) continue;
    const { occurredAtArg, type } = activity;

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
      occurredAt: toDate(args[occurredAtArg]),
      // dedupeKey from linkId (not seqNum) survives ServerAheadError rebases.
      dedupeKey: linkId ? `lvs:${type}:${linkId}` : null,
    });
  }
  return rows;
}
