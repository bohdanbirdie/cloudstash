import type { Store } from "@livestore/livestore";
import { Option, Schema } from "effect";

import type { schema } from "../../livestore/schema";
import { tables } from "../../livestore/schema";

export type LinkStage = "saving" | "processing";

export interface LinkInfo {
  domain: string;
  stage: LinkStage;
}

const TelegramMeta = Schema.Struct({
  chatId: Schema.Number,
  messageId: Schema.Number,
});

type ParsedMeta = typeof TelegramMeta.Type;

const decodeMeta = Schema.decodeOption(Schema.parseJson(TelegramMeta));

export const parseMeta = (sourceMeta: string | null): ParsedMeta | null => {
  if (!sourceMeta) return null;
  return Option.getOrNull(decodeMeta(sourceMeta));
};

export const evictOldestFromSet = (set: Set<string>, maxSize: number): void => {
  if (set.size <= maxSize) return;
  const excess = set.size - maxSize;
  const iter = set.values();
  for (let i = 0; i < excess; i++) {
    set.delete(iter.next().value!);
  }
};

const STAGE_LABELS: Record<LinkStage, string> = {
  saving: "Saving link",
  processing: "Processing link",
};

export const renderProgressDraft = (links: Map<string, LinkInfo>): string => {
  const lines = [...links.values()].map(
    ({ domain, stage }) => `${STAGE_LABELS[stage]}: ${domain}`
  );
  return lines.join("\n");
};

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

interface ProgressLink {
  id: string;
  source: string | null;
  sourceMeta: string | null;
  domain: string;
  url: string;
}

interface ProgressStatus {
  linkId: string;
  status: string;
}

export const buildTelegramProgress = (
  links: ReadonlyArray<ProgressLink>,
  statuses: ReadonlyArray<ProgressStatus>,
  chatId: number
): Map<string, LinkInfo> => {
  const statusMap = new Map(statuses.map((s) => [s.linkId, s]));
  const result = new Map<string, LinkInfo>();

  for (const link of links) {
    if (link.source !== "telegram") continue;

    const meta = parseMeta(link.sourceMeta);
    if (!meta || meta.chatId !== chatId) continue;

    const status = statusMap.get(link.id);
    if (status && TERMINAL_STATUSES.has(status.status)) continue;

    const stage: LinkStage =
      status?.status === "pending" ? "processing" : "saving";
    result.set(link.id, {
      domain: link.domain || link.url,
      stage,
    });
  }

  return result;
};

export const queryTelegramProgress = (
  store: Store<typeof schema>,
  chatId: number
): Map<string, LinkInfo> => {
  const links = store.query(tables.links.where({ deletedAt: null }));
  const statuses = store.query(tables.linkProcessingStatus.where({}));
  return buildTelegramProgress(links, statuses, chatId);
};

export const getProgressDraftText = (
  store: Store<typeof schema>,
  sourceMeta: string | null
): string | null => {
  const meta = parseMeta(sourceMeta);
  if (!meta) return null;

  const links = queryTelegramProgress(store, meta.chatId);
  if (links.size === 0) return null;

  return renderProgressDraft(links);
};
