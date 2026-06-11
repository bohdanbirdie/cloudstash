import { describe, expect, it } from "vitest";

import type { ApiLinkRow } from "@/livestore/queries/schemas";
import type { TagByLinkRow } from "@/livestore/queries/tags";

import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  decodeCursor,
  encodeCursor,
  encodeLinksPage,
  mergeTagNamesByLink,
  parseListParams,
} from "../api";

const row = (over: Partial<ApiLinkRow> = {}): ApiLinkRow => ({
  id: "lnk_1",
  url: "https://example.com/a",
  domain: "example.com",
  status: "unread",
  source: "extension",
  createdAt: 1_700_000_000_000,
  completedAt: null,
  title: "Title",
  description: "Desc",
  image: null,
  favicon: null,
  summary: null,
  processingStatus: "pending",
  ...over,
});

const tagRow = (over: Partial<TagByLinkRow> = {}): TagByLinkRow => ({
  linkId: "lnk_1",
  id: "tag_1",
  name: "ai",
  sortOrder: 0,
  createdAt: 1_700_000_000_000,
  deletedAt: null,
  ...over,
});

const url = (qs: string): URL => new URL(`https://x.test/api/links${qs}`);

describe("cursor codec", () => {
  it("round-trips createdAt + id", () => {
    const c = { createdAt: 1_700_000_123_456, id: "lnk_abc" };
    const decoded = decodeCursor(encodeCursor(c));
    expect(decoded).toEqual(c);
  });

  it("is opaque base64url (no +/=)", () => {
    const token = encodeCursor({
      createdAt: 1_700_000_123_456,
      id: "lnk/ab+c",
    });
    expect(token).not.toMatch(/[+/=]/);
  });

  it("rejects malformed tokens", () => {
    expect(decodeCursor("not-base64!!!")).toBeNull();
    expect(decodeCursor(encodeCursor({ createdAt: 1, id: "" }))).toBeNull();
    expect(decodeCursor(btoa(JSON.stringify({ t: "x", id: "a" })))).toBeNull();
    expect(decodeCursor(btoa(JSON.stringify({ id: "a" })))).toBeNull();
  });
});

describe("parseListParams", () => {
  it("defaults to state=all and DEFAULT_LIMIT with no cursor", () => {
    const p = parseListParams(url(""));
    expect(p).toEqual({
      ok: true,
      state: "all",
      limit: DEFAULT_LIMIT,
      cursor: null,
    });
  });

  it("accepts every valid state", () => {
    for (const state of ["inbox", "completed", "all", "archive"] as const) {
      const p = parseListParams(url(`?state=${state}`));
      expect(p.ok && p.state).toBe(state);
    }
  });

  it("rejects an unknown state", () => {
    expect(parseListParams(url("?state=bogus"))).toEqual({
      ok: false,
      error: "Invalid state",
    });
  });

  it("validates limit bounds", () => {
    expect(parseListParams(url("?limit=10")).ok).toBe(true);
    expect(parseListParams(url(`?limit=${MAX_LIMIT}`)).ok).toBe(true);
    expect(parseListParams(url("?limit=0"))).toEqual({
      ok: false,
      error: "Invalid limit",
    });
    expect(parseListParams(url(`?limit=${MAX_LIMIT + 1}`)).ok).toBe(false);
    expect(parseListParams(url("?limit=1.5")).ok).toBe(false);
    expect(parseListParams(url("?limit=abc")).ok).toBe(false);
  });

  it("decodes a valid cursor and rejects an invalid one", () => {
    const token = encodeCursor({ createdAt: 42, id: "lnk_x" });
    const ok = parseListParams(url(`?cursor=${token}`));
    expect(ok.ok && ok.cursor).toEqual({ createdAt: 42, id: "lnk_x" });
    expect(parseListParams(url("?cursor=garbage%21"))).toEqual({
      ok: false,
      error: "Invalid cursor",
    });
  });
});

describe("mergeTagNamesByLink", () => {
  it("groups accepted names by linkId preserving row order", () => {
    const map = mergeTagNamesByLink(
      [
        tagRow({ linkId: "a", name: "x" }),
        tagRow({ linkId: "a", name: "y" }),
        tagRow({ linkId: "b", name: "z" }),
      ],
      []
    );
    expect(map.get("a")).toEqual(["x", "y"]);
    expect(map.get("b")).toEqual(["z"]);
    expect(map.has("c")).toBe(false);
  });

  it("appends pending suggestions after accepted tags", () => {
    const map = mergeTagNamesByLink(
      [tagRow({ linkId: "a", name: "accepted" })],
      [tagRow({ linkId: "a", name: "suggested" })]
    );
    expect(map.get("a")).toEqual(["accepted", "suggested"]);
  });

  it("de-duplicates by name across accepted + pending (accepted wins)", () => {
    const map = mergeTagNamesByLink(
      [tagRow({ linkId: "a", id: "t1", name: "ai" })],
      [tagRow({ linkId: "a", id: "ai", name: "ai" })]
    );
    expect(map.get("a")).toEqual(["ai"]);
  });

  it("emits a pending-only link with no accepted tags", () => {
    const map = mergeTagNamesByLink([], [tagRow({ linkId: "b", name: "p" })]);
    expect(map.get("b")).toEqual(["p"]);
  });
});

describe("encodeLinksPage", () => {
  it("maps statuses, dates, tags and source", () => {
    const page = encodeLinksPage(
      [
        row({
          id: "lnk_1",
          status: "completed",
          processingStatus: "completed",
          completedAt: 1_700_000_500_000,
          summary: "AI summary",
        }),
      ],
      new Map([["lnk_1", ["ai", "reading"]]]),
      1,
      50
    );

    expect(page.links[0]).toEqual({
      id: "lnk_1",
      url: "https://example.com/a",
      title: "Title",
      description: "Desc",
      summary: "AI summary",
      domain: "example.com",
      image: null,
      favicon: null,
      tags: ["ai", "reading"],
      state: "completed",
      processing: "done",
      source: "extension",
      createdAt: "2023-11-14T22:13:20.000Z",
      completedAt: "2023-11-14T22:21:40.000Z",
    });
    expect(page.total).toBe(1);
    expect(page.nextCursor).toBeNull();
  });

  it("maps unread -> inbox and empty tags", () => {
    const page = encodeLinksPage([row()], new Map(), 1, 50);
    expect(page.links[0].state).toBe("inbox");
    expect(page.links[0].tags).toEqual([]);
  });

  it.each([
    ["pending", "pending"],
    ["processing", "processing"],
    ["reprocess-requested", "processing"],
    ["completed", "done"],
    ["failed", "failed"],
    ["cancelled", "failed"],
    [null, "none"],
    ["weird-unknown", "none"],
  ] as const)("maps processing %s -> %s", (internal, expected) => {
    const page = encodeLinksPage(
      [row({ processingStatus: internal })],
      new Map(),
      1,
      50
    );
    expect(page.links[0].processing).toBe(expected);
  });

  it("trims to limit and emits nextCursor from the last kept row", () => {
    const rows = [
      row({ id: "a", createdAt: 3 }),
      row({ id: "b", createdAt: 2 }),
      row({ id: "c", createdAt: 1 }),
    ];
    const page = encodeLinksPage(rows, new Map(), 9, 2);
    expect(page.links.map((l) => l.id)).toEqual(["a", "b"]);
    expect(page.nextCursor).toBe(encodeCursor({ createdAt: 2, id: "b" }));
  });

  it("returns nextCursor=null on the last page", () => {
    const page = encodeLinksPage([row({ id: "a" })], new Map(), 1, 2);
    expect(page.links).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it("handles an empty result", () => {
    expect(encodeLinksPage([], new Map(), 0, 50)).toEqual({
      links: [],
      total: 0,
      nextCursor: null,
    });
  });
});
