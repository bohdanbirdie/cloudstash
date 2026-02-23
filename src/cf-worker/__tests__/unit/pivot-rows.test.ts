import { describe, it, expect } from "vitest";

import { pivotRows } from "@/components/admin/use-usage-admin";
import { type AdminUser } from "@/types/api";

const makeUser = (id: string, name: string, email: string): AdminUser =>
  ({ id, name, email }) as AdminUser;

describe("pivotRows", () => {
  it("groups rows by userId and sums counts per event", () => {
    const rows = [
      { userId: "u1", event: "sync", count: 10 },
      { userId: "u1", event: "auth", count: 3 },
      { userId: "u1", event: "sync_auth", count: 5 },
    ];
    const users = [makeUser("u1", "Alice", "alice@test.com")];

    const result = pivotRows(rows, users);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      userId: "u1",
      name: "Alice",
      email: "alice@test.com",
      total: 18,
      sync: 10,
      sync_auth: 5,
      auth: 3,
      chat: 0,
      ingest: 0,
    });
  });

  it("resolves user names from admin user list", () => {
    const rows = [{ userId: "u1", event: "sync", count: 1 }];
    const users = [makeUser("u1", "Bob", "bob@test.com")];

    const [entry] = pivotRows(rows, users);
    expect(entry.name).toBe("Bob");
    expect(entry.email).toBe("bob@test.com");
  });

  it("falls back to truncated userId when user not found", () => {
    const rows = [{ userId: "usr_abcdef12", event: "sync", count: 1 }];

    const [entry] = pivotRows(rows, []);
    expect(entry.name).toBe("usr_abcd");
    expect(entry.email).toBe("");
  });

  it("sorts by total descending", () => {
    const rows = [
      { userId: "u1", event: "sync", count: 5 },
      { userId: "u2", event: "sync", count: 20 },
      { userId: "u3", event: "sync", count: 10 },
    ];

    const result = pivotRows(rows, []);
    expect(result.map((r) => r.userId)).toEqual(["u2", "u3", "u1"]);
  });

  it("ignores unknown event types but still counts in total", () => {
    const rows = [
      { userId: "u1", event: "sync", count: 5 },
      { userId: "u1", event: "unknown_event", count: 3 },
    ];

    const [entry] = pivotRows(rows, []);
    expect(entry.total).toBe(8);
    expect(entry.sync).toBe(5);
    // unknown_event doesn't map to any column
    expect(entry.auth).toBe(0);
    expect(entry.chat).toBe(0);
  });

  it("handles multiple users with multiple events", () => {
    const rows = [
      { userId: "u1", event: "sync", count: 100 },
      { userId: "u1", event: "auth", count: 10 },
      { userId: "u2", event: "sync", count: 50 },
      { userId: "u2", event: "chat", count: 20 },
      { userId: "u2", event: "ingest", count: 5 },
    ];
    const users = [
      makeUser("u1", "Alice", "a@t.com"),
      makeUser("u2", "Bob", "b@t.com"),
    ];

    const result = pivotRows(rows, users);

    expect(result).toHaveLength(2);
    expect(result[0].userId).toBe("u1");
    expect(result[0].total).toBe(110);
    expect(result[1].userId).toBe("u2");
    expect(result[1].total).toBe(75);
    expect(result[1].chat).toBe(20);
    expect(result[1].ingest).toBe(5);
  });

  it("returns empty array for empty rows", () => {
    expect(pivotRows([], [])).toEqual([]);
  });
});
