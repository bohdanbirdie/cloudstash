import { describe, expect, it } from "@effect/vitest";

import { LinkId, TagId } from "../../db/branded";
import type { DigestSourceData } from "../build-digest-links";
import { buildDigestLinks } from "../build-digest-links";

const NOW = new Date("2026-05-23T12:00:00Z").getTime();
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const CUTOFF = NOW - SEVEN_DAYS_MS;

const lid = (s: string) => LinkId.make(s);
const tid = (s: string) => TagId.make(s);

const baseData: DigestSourceData = {
  linkTags: [],
  links: [],
  snapshots: [],
  summaries: [],
  tags: [],
};

describe("buildDigestLinks", () => {
  it("returns [] when no links exist", () => {
    expect(buildDigestLinks(baseData, CUTOFF)).toEqual([]);
  });

  it("filters out links older than the cutoff", () => {
    const result = buildDigestLinks(
      {
        ...baseData,
        links: [
          {
            createdAt: new Date(NOW - 14 * 24 * 60 * 60 * 1000),
            domain: "old.com",
            id: lid("old"),
            url: "https://old.com",
          },
          {
            createdAt: new Date(NOW - 1 * 24 * 60 * 60 * 1000),
            domain: "new.com",
            id: lid("new"),
            url: "https://new.com",
          },
        ],
        snapshots: [
          {
            fetchedAt: new Date(NOW),
            linkId: lid("old"),
            title: "Old",
          },
          {
            fetchedAt: new Date(NOW),
            linkId: lid("new"),
            title: "New",
          },
        ],
      },
      CUTOFF
    );
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("New");
  });

  it("includes links whose createdAt equals the cutoff (>= boundary)", () => {
    const result = buildDigestLinks(
      {
        ...baseData,
        links: [
          {
            createdAt: new Date(CUTOFF),
            domain: "edge.com",
            id: lid("edge"),
            url: "https://edge.com",
          },
        ],
        snapshots: [
          { fetchedAt: new Date(NOW), linkId: lid("edge"), title: "Edge" },
        ],
      },
      CUTOFF
    );
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Edge");
  });

  it("picks the latest snapshot by fetchedAt when multiple exist", () => {
    const result = buildDigestLinks(
      {
        ...baseData,
        links: [
          {
            createdAt: new Date(NOW),
            domain: "ex.com",
            id: lid("l1"),
            url: "https://ex.com",
          },
        ],
        snapshots: [
          {
            fetchedAt: new Date(NOW - 1000),
            linkId: lid("l1"),
            title: "Older",
          },
          {
            fetchedAt: new Date(NOW),
            linkId: lid("l1"),
            title: "Newer",
          },
        ],
      },
      CUTOFF
    );
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Newer");
  });

  it("drops links whose latest snapshot has no title", () => {
    const result = buildDigestLinks(
      {
        ...baseData,
        links: [
          {
            createdAt: new Date(NOW),
            domain: "ex.com",
            id: lid("l1"),
            url: "https://ex.com",
          },
        ],
        snapshots: [
          {
            fetchedAt: new Date(NOW),
            linkId: lid("l1"),
            title: null,
          },
        ],
      },
      CUTOFF
    );
    expect(result).toEqual([]);
  });

  it("drops links with no snapshot at all", () => {
    const result = buildDigestLinks(
      {
        ...baseData,
        links: [
          {
            createdAt: new Date(NOW),
            domain: "ex.com",
            id: lid("l1"),
            url: "https://ex.com",
          },
        ],
      },
      CUTOFF
    );
    expect(result).toEqual([]);
  });

  it("picks the latest summary by summarizedAt", () => {
    const result = buildDigestLinks(
      {
        ...baseData,
        links: [
          {
            createdAt: new Date(NOW),
            domain: "ex.com",
            id: lid("l1"),
            url: "https://ex.com",
          },
        ],
        snapshots: [
          { fetchedAt: new Date(NOW), linkId: lid("l1"), title: "T" },
        ],
        summaries: [
          {
            linkId: lid("l1"),
            summarizedAt: new Date(NOW - 1000),
            summary: "older",
          },
          {
            linkId: lid("l1"),
            summarizedAt: new Date(NOW),
            summary: "newer",
          },
        ],
      },
      CUTOFF
    );
    expect(result[0].summary).toBe("newer");
  });

  it("falls back to empty summary when none exists", () => {
    const result = buildDigestLinks(
      {
        ...baseData,
        links: [
          {
            createdAt: new Date(NOW),
            domain: "ex.com",
            id: lid("l1"),
            url: "https://ex.com",
          },
        ],
        snapshots: [
          { fetchedAt: new Date(NOW), linkId: lid("l1"), title: "T" },
        ],
      },
      CUTOFF
    );
    expect(result[0].summary).toBe("");
  });

  it("joins tag names via linkTags and tags", () => {
    const result = buildDigestLinks(
      {
        linkTags: [
          { linkId: lid("l1"), tagId: tid("t1") },
          { linkId: lid("l1"), tagId: tid("t2") },
        ],
        links: [
          {
            createdAt: new Date(NOW),
            domain: "ex.com",
            id: lid("l1"),
            url: "https://ex.com",
          },
        ],
        snapshots: [
          { fetchedAt: new Date(NOW), linkId: lid("l1"), title: "T" },
        ],
        summaries: [],
        tags: [
          { id: tid("t1"), name: "alpha" },
          { id: tid("t2"), name: "beta" },
        ],
      },
      CUTOFF
    );
    expect(result[0].tags).toEqual(["alpha", "beta"]);
  });

  it("skips linkTags pointing at tags not in the tags array (already filtered for deletedAt by caller)", () => {
    const result = buildDigestLinks(
      {
        linkTags: [
          { linkId: lid("l1"), tagId: tid("t1") },
          { linkId: lid("l1"), tagId: tid("deleted") },
        ],
        links: [
          {
            createdAt: new Date(NOW),
            domain: "ex.com",
            id: lid("l1"),
            url: "https://ex.com",
          },
        ],
        snapshots: [
          { fetchedAt: new Date(NOW), linkId: lid("l1"), title: "T" },
        ],
        summaries: [],
        tags: [{ id: tid("t1"), name: "alpha" }],
      },
      CUTOFF
    );
    expect(result[0].tags).toEqual(["alpha"]);
  });

  it("returns empty tags array when link has no linkTags", () => {
    const result = buildDigestLinks(
      {
        ...baseData,
        links: [
          {
            createdAt: new Date(NOW),
            domain: "ex.com",
            id: lid("l1"),
            url: "https://ex.com",
          },
        ],
        snapshots: [
          { fetchedAt: new Date(NOW), linkId: lid("l1"), title: "T" },
        ],
      },
      CUTOFF
    );
    expect(result[0].tags).toEqual([]);
  });
});
