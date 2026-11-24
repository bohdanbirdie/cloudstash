import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { firstDifference, play } from "../src/scenario";
import type { Scenario } from "../src/scenario";

const tagCreated = {
  event: "v1.TagCreated",
  args: {
    createdAt: "2026-01-02T09:30:00.000Z",
    id: "tag-1",
    name: "design",
    sortOrder: 1,
  },
};

const scenario: Scenario = {
  about: "Create and rename a tag",
  steps: [
    tagCreated,
    { event: "v1.TagRenamed", args: { id: "tag-1", name: "ux" } },
  ],
};

describe("play", () => {
  it.effect("records the tables each step changes", () =>
    Effect.gen(function* () {
      const played = yield* play(scenario);
      expect(played.steps.map((step) => step.expect)).toEqual([
        {
          tags: [
            {
              id: "tag-1",
              name: "design",
              sortOrder: 1,
              createdAt: 1767346200000,
              deletedAt: null,
            },
          ],
        },
        {
          tags: [
            {
              id: "tag-1",
              name: "ux",
              sortOrder: 1,
              createdAt: 1767346200000,
              deletedAt: null,
            },
          ],
        },
      ]);
    })
  );

  it.effect("records an empty change for a step that changes nothing", () =>
    Effect.gen(function* () {
      const played = yield* play({
        about: "Rename a missing tag",
        steps: [{ event: "v1.TagRenamed", args: { id: "nope", name: "x" } }],
      });
      expect(played.steps[0]?.expect).toEqual({});
    })
  );

  it.effect("fails a step with an unknown event", () =>
    Effect.gen(function* () {
      const failure = yield* play({
        about: "Unknown",
        steps: [{ event: "v1.TagColored", args: {} }],
      }).pipe(Effect.flip);
      expect(failure).toMatchObject({
        _tag: "StepFailed",
        step: 1,
        event: "v1.TagColored",
        reason: "there is no such event",
      });
    })
  );

  it.effect("fails a step whose args no longer decode", () =>
    Effect.gen(function* () {
      const failure = yield* play({
        about: "Missing field",
        steps: [{ event: "v1.TagRenamed", args: { id: "tag-1" } }],
      }).pipe(Effect.flip);
      expect(failure.reason).toMatch(/^its args no longer decode: /);
    })
  );

  it.effect("fails a step whose args re-encode differently", () =>
    Effect.gen(function* () {
      const failure = yield* play({
        about: "Date without milliseconds",
        steps: [
          {
            ...tagCreated,
            args: { ...tagCreated.args, createdAt: "2026-01-02T09:30:00Z" },
          },
        ],
      }).pipe(Effect.flip);
      expect(failure.reason).toMatch(/^its args re-encode as /);
    })
  );
});

describe("firstDifference", () => {
  it.effect("names the first step whose tables differ", () =>
    Effect.gen(function* () {
      const played = yield* play(scenario);
      const recorded: Scenario = {
        ...played,
        steps: played.steps.map((step, index) =>
          index === 1 ? { ...step, expect: {} } : step
        ),
      };
      expect(firstDifference(played, played)).toBeUndefined();
      expect(firstDifference(recorded, played)).toMatch(
        /^step 2 \(v1\.TagRenamed\) changes tags to \[.*"name":"ux".*\] instead of "nothing"$/
      );
    })
  );
});
