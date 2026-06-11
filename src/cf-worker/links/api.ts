import type { LinkStatus } from "@/livestore/queries/filtered-links";
import type { ApiLinkRow } from "@/livestore/queries/schemas";
import type { TagByLinkRow } from "@/livestore/queries/tags";

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 100;

const STATES: readonly LinkStatus[] = ["inbox", "completed", "all", "archive"];

export type ApiLinkState = "inbox" | "completed";
export type ApiLinkProcessing =
  | "pending"
  | "processing"
  | "done"
  | "failed"
  | "none";

export interface ApiLink {
  id: string;
  url: string;
  title: string | null;
  description: string | null;
  summary: string | null;
  domain: string;
  image: string | null;
  favicon: string | null;
  tags: string[];
  state: ApiLinkState;
  processing: ApiLinkProcessing;
  source: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ApiLinksPage {
  links: ApiLink[];
  total: number;
  nextCursor: string | null;
}

export interface Cursor {
  createdAt: number;
  id: string;
}

const toB64Url = (s: string): string =>
  btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const fromB64Url = (s: string): string =>
  atob(s.replace(/-/g, "+").replace(/_/g, "/"));

export const encodeCursor = (cursor: Cursor): string =>
  toB64Url(JSON.stringify({ t: cursor.createdAt, id: cursor.id }));

export const decodeCursor = (raw: string): Cursor | null => {
  try {
    const parsed = JSON.parse(fromB64Url(raw)) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "t" in parsed &&
      "id" in parsed &&
      typeof parsed.t === "number" &&
      Number.isFinite(parsed.t) &&
      typeof parsed.id === "string" &&
      parsed.id.length > 0
    ) {
      return { createdAt: parsed.t, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
};

export type ParsedListParams =
  | { ok: true; state: LinkStatus; limit: number; cursor: Cursor | null }
  | { ok: false; error: string };

export const parseListParams = (url: URL): ParsedListParams => {
  const state = url.searchParams.get("state") ?? "all";
  if (!STATES.includes(state as LinkStatus)) {
    return { ok: false, error: "Invalid state" };
  }

  let limit = DEFAULT_LIMIT;
  const limitRaw = url.searchParams.get("limit");
  if (limitRaw !== null) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) {
      return { ok: false, error: "Invalid limit" };
    }
    limit = n;
  }

  let cursor: Cursor | null = null;
  const cursorRaw = url.searchParams.get("cursor");
  if (cursorRaw !== null) {
    cursor = decodeCursor(cursorRaw);
    if (!cursor) {
      return { ok: false, error: "Invalid cursor" };
    }
  }

  return { ok: true, state: state as LinkStatus, limit, cursor };
};

const mapState = (status: string): ApiLinkState =>
  status === "completed" ? "completed" : "inbox";

const mapProcessing = (status: string | null): ApiLinkProcessing => {
  switch (status) {
    case "pending":
      return "pending";
    case "processing":
    case "reprocess-requested":
      return "processing";
    case "completed":
      return "done";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return "none";
  }
};

const toIso = (ms: number | null): string | null =>
  ms === null ? null : new Date(ms).toISOString();

export const mergeTagNamesByLink = (
  acceptedRows: readonly TagByLinkRow[],
  pendingRows: readonly TagByLinkRow[]
): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  const add = (linkId: string, name: string) => {
    const names = map.get(linkId);
    if (!names) map.set(linkId, [name]);
    else if (!names.includes(name)) names.push(name);
  };
  for (const row of acceptedRows) add(row.linkId, row.name);
  for (const row of pendingRows) add(row.linkId, row.name);
  return map;
};

export const encodeLinksPage = (
  rows: readonly ApiLinkRow[],
  tagsByLink: ReadonlyMap<string, string[]>,
  total: number,
  limit: number
): ApiLinksPage => {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const links = page.map(
    (row): ApiLink => ({
      id: row.id,
      url: row.url,
      title: row.title,
      description: row.description,
      summary: row.summary,
      domain: row.domain,
      image: row.image,
      favicon: row.favicon,
      tags: tagsByLink.get(row.id) ?? [],
      state: mapState(row.status),
      processing: mapProcessing(row.processingStatus),
      source: row.source,
      createdAt: new Date(row.createdAt).toISOString(),
      completedAt: toIso(row.completedAt),
    })
  );

  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt, id: last.id })
      : null;

  return { links, total, nextCursor };
};
