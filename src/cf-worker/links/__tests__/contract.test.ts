import { Option, Schema } from "effect";
import { describe, expect, it } from "vitest";

import {
  ListLinksInput,
  SaveLinkInput,
  SearchLinksInput,
  UpdateLinkInput,
  UpdateLinksInput,
} from "@/lib/links-contract";

const accepts = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown
): boolean =>
  Option.isSome(
    Schema.decodeUnknownOption(schema, { onExcessProperty: "error" })(value)
  );

describe("shared link contracts", () => {
  it("supports paginated list and date-bounded search inputs", () => {
    expect(
      accepts(ListLinksInput, {
        state: "archive",
        limit: 10,
        cursor: "opaque",
        sort: "oldest",
      })
    ).toBe(true);
    expect(
      accepts(SearchLinksInput, {
        query: "distributed systems",
        match: "all",
        state: "any",
        createdAfter: "2026-06-01T00:00:00Z",
        createdBefore: "2026-08-01T00:00:00Z",
      })
    ).toBe(true);
    expect(accepts(ListLinksInput, { state: "active" })).toBe(true);
    expect(accepts(ListLinksInput, { state: "all" })).toBe(true);
  });

  it("supports save-with-tags and single/batch state-tag updates", () => {
    expect(
      accepts(SaveLinkInput, {
        url: "https://example.com/post",
        tags: ["reading"],
      })
    ).toBe(true);
    expect(
      accepts(UpdateLinkInput, {
        id: "link-1",
        changes: { state: "completed", tags: { add: ["done"] } },
      })
    ).toBe(true);
    expect(
      accepts(UpdateLinksInput, {
        where: { createdBefore: "2025-01-01T00:00:00Z" },
        changes: { state: "completed" },
        limit: 100,
      })
    ).toBe(true);
  });

  it("rejects oversized pages, batches, and unsupported mutable fields", () => {
    expect(accepts(ListLinksInput, { limit: 101 })).toBe(false);
    expect(
      accepts(UpdateLinksInput, {
        ids: Array.from({ length: 101 }, (_, index) => `link-${index}`),
        changes: { state: "completed" },
      })
    ).toBe(false);
    expect(
      accepts(UpdateLinkInput, {
        id: "link-1",
        changes: { reprocess: true },
      })
    ).toBe(false);
    expect(accepts(ListLinksInput, { createdAfter: "2026" })).toBe(false);
    expect(
      accepts(ListLinksInput, { createdAfter: "2026-02-30T00:00:00Z" })
    ).toBe(false);
  });
});
