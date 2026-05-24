import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { OrgId } from "../../db/branded";
import {
  DigestEventSinkError,
  DigestLinkSourceError,
  WeeklyDigestGenerateError,
} from "../errors";
import { mapDigestFailures } from "../run-digest";

const CTX = { storeId: OrgId.make("org-1"), trigger: "manual" as const };

describe("mapDigestFailures", () => {
  it.effect("passes through success unchanged", () =>
    Effect.gen(function* () {
      const result = yield* mapDigestFailures(Effect.succeed("ok"), CTX);
      expect(result).toBe("ok");
    })
  );

  it.effect("maps DigestEventSinkError → failed(event-sink, msg)", () =>
    Effect.gen(function* () {
      const result = yield* mapDigestFailures(
        Effect.fail(
          new DigestEventSinkError({
            message: "commit blew up",
            operation: "commit",
          })
        ),
        CTX
      );
      expect(result).toEqual({
        message: "commit blew up",
        reason: "event-sink",
        status: "failed",
      });
    })
  );

  it.effect("maps DigestLinkSourceError → failed(link-source, msg)", () =>
    Effect.gen(function* () {
      const result = yield* mapDigestFailures(
        Effect.fail(
          new DigestLinkSourceError({
            message: "query failed",
            operation: "collect",
          })
        ),
        CTX
      );
      expect(result).toEqual({
        message: "query failed",
        reason: "link-source",
        status: "failed",
      });
    })
  );

  it.effect("maps WeeklyDigestGenerateError → failed(generator, msg)", () =>
    Effect.gen(function* () {
      const result = yield* mapDigestFailures(
        Effect.fail(
          new WeeklyDigestGenerateError({
            linkCount: 5,
            message: "model 429",
            model: "test-model",
            statusCode: 429,
          })
        ),
        CTX
      );
      expect(result).toEqual({
        message: "model 429",
        reason: "generator",
        status: "failed",
      });
    })
  );

  it.effect("maps Error defect → failed(defect, error.message)", () =>
    Effect.gen(function* () {
      const result = yield* mapDigestFailures(
        Effect.die(new TypeError("kaboom")),
        CTX
      );
      expect(result).toEqual({
        message: "kaboom",
        reason: "defect",
        status: "failed",
      });
    })
  );

  it.effect("maps non-Error defect → failed(defect, String(defect))", () =>
    Effect.gen(function* () {
      const result = yield* mapDigestFailures(Effect.die("boom-string"), CTX);
      expect(result).toEqual({
        message: "boom-string",
        reason: "defect",
        status: "failed",
      });
    })
  );
});
