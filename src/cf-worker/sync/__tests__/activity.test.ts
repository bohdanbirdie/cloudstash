import { describe, expect, it } from "vitest";

import { toActivityRows } from "../activity";

// WK-07-B. The event name to activity type mapping and the event name to
// timestamp field mapping used to be two separate records kept aligned by
// hand, with nothing tying them together. They are one table now, and this
// pins what each supported event actually produces — activity.ts previously
// had no test at all.

const ORG = "org-1";

describe("toActivityRows", () => {
  it("maps both LinkCreated versions to a save at createdAt", () => {
    const rows = toActivityRows(ORG, [
      {
        args: {
          createdAt: "2026-08-01T10:00:00.000Z",
          domain: "example.com",
          id: "link-1",
          url: "https://example.com/a",
        },
        name: "v1.LinkCreated",
      },
      {
        args: {
          createdAt: "2026-08-02T10:00:00.000Z",
          domain: "example.org",
          id: "link-2",
          source: "telegram",
          sourceMeta: null,
          url: "https://example.org/b",
        },
        name: "v2.LinkCreated",
      },
    ]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      dedupeKey: "lvs:link_saved:link-1",
      meta: { domain: "example.com" },
      organizationId: ORG,
      refId: "link-1",
      // v1 carries no source; only v2 does.
      source: null,
      type: "link_saved",
    });
    expect(rows[1]?.source).toBe("telegram");
    expect(rows[0]?.occurredAt).toEqual(new Date("2026-08-01T10:00:00.000Z"));
    expect(rows[1]?.occurredAt).toEqual(new Date("2026-08-02T10:00:00.000Z"));
  });

  it("reads deletedAt for a delete and completedAt for a completion", () => {
    const rows = toActivityRows(ORG, [
      {
        args: { deletedAt: "2026-08-03T10:00:00.000Z", id: "link-3" },
        name: "v1.LinkDeleted",
      },
      {
        args: { completedAt: "2026-08-04T10:00:00.000Z", id: "link-4" },
        name: "v1.LinkCompleted",
      },
    ]);

    expect(rows[0]).toMatchObject({
      dedupeKey: "lvs:link_deleted:link-3",
      type: "link_deleted",
    });
    expect(rows[0]?.occurredAt).toEqual(new Date("2026-08-03T10:00:00.000Z"));
    expect(rows[1]).toMatchObject({
      dedupeKey: "lvs:link_completed:link-4",
      type: "link_completed",
    });
    expect(rows[1]?.occurredAt).toEqual(new Date("2026-08-04T10:00:00.000Z"));
  });

  it("ignores events it does not track", () => {
    expect(
      toActivityRows(ORG, [
        { args: { id: "link-5" }, name: "v1.LinkMetadataFetched" },
        { args: { id: "link-6" }, name: "v1.TagCreated" },
      ])
    ).toEqual([]);
  });

  it("omits meta when the event carries no domain", () => {
    const [row] = toActivityRows(ORG, [
      {
        args: { deletedAt: "2026-08-05T10:00:00.000Z", id: "link-7" },
        name: "v1.LinkDeleted",
      },
    ]);

    expect(row?.meta).toBeNull();
    expect(row?.source).toBeNull();
  });
});

// The row still has to be writable when a push carries something the schema
// would not produce, since onPush sees raw client data.
describe("toActivityRows with unexpected args", () => {
  it("falls back to the push time when the timestamp is unusable", () => {
    const before = Date.now();
    const [row] = toActivityRows(ORG, [
      {
        args: { createdAt: "not-a-date", id: "link-8" },
        name: "v1.LinkCreated",
      },
    ]);

    expect(row?.occurredAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(row?.type).toBe("link_saved");
  });

  it("drops the dedupe key when the event carries no id", () => {
    const [row] = toActivityRows(ORG, [
      {
        args: { createdAt: "2026-08-06T10:00:00.000Z" },
        name: "v1.LinkCreated",
      },
    ]);

    expect(row?.dedupeKey).toBeNull();
    expect(row?.refId).toBeNull();
  });

  it("tolerates an event with no args at all", () => {
    const [row] = toActivityRows(ORG, [{ args: null, name: "v1.LinkDeleted" }]);

    expect(row?.type).toBe("link_deleted");
    expect(row?.dedupeKey).toBeNull();
  });
});
