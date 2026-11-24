import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { validatePushedEvents } from "../validate-events";

const linkCreated = {
  name: "v2.LinkCreated",
  args: {
    createdAt: "2026-01-01T09:30:00.000Z",
    domain: "example.com",
    id: "link-a",
    source: "app",
    sourceMeta: null,
    url: "https://example.com/a",
  },
};

describe("validatePushedEvents", () => {
  it.effect("accepts events whose args decode, including old versions", () =>
    Effect.gen(function* () {
      yield* validatePushedEvents([
        linkCreated,
        {
          name: "v1.LinkCreated",
          args: {
            createdAt: "2026-01-02T09:30:00.000Z",
            domain: "example.org",
            id: "link-b",
            url: "https://example.org/b",
          },
        },
        { name: "v1.TagRenamed", args: { id: "tag-1", name: "ux" } },
      ]);
    })
  );

  it.effect("rejects an unknown event", () =>
    Effect.gen(function* () {
      const error = yield* validatePushedEvents([
        linkCreated,
        { name: "v9.LinkTeleported", args: {} },
      ]).pipe(Effect.flip);
      expect(error).toMatchObject({
        _tag: "InvalidPushedEventError",
        event: "v9.LinkTeleported",
        reason: "unknown event",
      });
    })
  );

  it.effect("rejects args that do not decode, without echoing them", () =>
    Effect.gen(function* () {
      const missingField = yield* validatePushedEvents([
        { name: "v1.TagRenamed", args: { id: "tag-1" } },
      ]).pipe(Effect.flip);
      const wrongType = yield* validatePushedEvents([
        { ...linkCreated, args: { ...linkCreated.args, createdAt: 42 } },
      ]).pipe(Effect.flip);
      for (const error of [missingField, wrongType]) {
        expect(error.reason).toBe("args do not match the event schema");
      }
      expect(wrongType.event).toBe("v2.LinkCreated");
    })
  );
});
