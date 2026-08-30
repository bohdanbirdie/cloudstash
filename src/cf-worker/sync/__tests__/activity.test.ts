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
          source: "manual",
        },
        name: "v1.LinkCreated",
      },
      {
        args: {
          createdAt: "2026-08-02T10:00:00.000Z",
          domain: "example.org",
          id: "link-2",
          source: "telegram",
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
      source: "manual",
      type: "link_saved",
    });
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
