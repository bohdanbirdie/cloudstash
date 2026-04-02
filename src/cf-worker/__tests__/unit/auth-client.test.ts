import { it, describe } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { expect } from "vitest";

import { AuthClient } from "../../auth/service";
import { UserId } from "../../db/branded";
import { DbError } from "../../db/service";

const mockUser = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  emailVerified: true,
  image: null,
  role: "user",
  banned: false,
  banReason: null,
  banExpires: null,
  approved: false,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const approvedUser = { ...mockUser, approved: true };

function makeAuthClientLayer(
  overrides: Partial<{
    findUser: AuthClient["Type"]["findUser"];
    approveUser: AuthClient["Type"]["approveUser"];
    listApprovedUsers: AuthClient["Type"]["listApprovedUsers"];
    getSession: (opts: { headers: Headers }) => Promise<{
      user: { id: string; role?: string };
      session: unknown;
    } | null>;
  }> = {}
) {
  return Layer.succeed(AuthClient, {
    api: {
      getSession: overrides.getSession ?? (() => Promise.resolve(null)),
    },
    findUser: overrides.findUser ?? (() => Effect.succeed(null)),
    approveUser: overrides.approveUser ?? (() => Effect.void),
    listApprovedUsers:
      overrides.listApprovedUsers ?? (() => Effect.succeed([])),
  } as unknown as AuthClient["Type"]);
}

describe("AuthClient enriched methods", () => {
  describe("findUser", () => {
    it.effect("returns user when found", () => {
      const layer = makeAuthClientLayer({
        findUser: (userId) =>
          userId === "user-1" ? Effect.succeed(mockUser) : Effect.succeed(null),
      });

      return Effect.gen(function* () {
        const auth = yield* AuthClient;
        const result = yield* auth.findUser(UserId.make("user-1"));
        expect(result).toEqual(mockUser);
      }).pipe(Effect.provide(layer));
    });

    it.effect("returns null when user not found", () => {
      const layer = makeAuthClientLayer();

      return Effect.gen(function* () {
        const auth = yield* AuthClient;
        const result = yield* auth.findUser(UserId.make("nonexistent"));
        expect(result).toBeNull();
      }).pipe(Effect.provide(layer));
    });

    it.effect("propagates DbError", () => {
      const layer = makeAuthClientLayer({
        findUser: () =>
          Effect.fail(new DbError({ cause: new Error("query failed") })),
      });

      return Effect.gen(function* () {
        const auth = yield* AuthClient;
        yield* auth.findUser(UserId.make("user-1"));
      }).pipe(
        Effect.provide(layer),
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error._tag).toBe("DbError");
          })
        )
      );
    });
  });

  describe("approveUser", () => {
    it.effect("calls with correct userId", () => {
      let capturedId: string | null = null;

      const layer = makeAuthClientLayer({
        approveUser: (userId) => {
          capturedId = userId;
          return Effect.void;
        },
      });

      return Effect.gen(function* () {
        const auth = yield* AuthClient;
        yield* auth.approveUser(UserId.make("user-1"));
        expect(capturedId).toBe("user-1");
      }).pipe(Effect.provide(layer));
    });

    it.effect("propagates DbError", () => {
      const layer = makeAuthClientLayer({
        approveUser: () =>
          Effect.fail(new DbError({ cause: new Error("update failed") })),
      });

      return Effect.gen(function* () {
        const auth = yield* AuthClient;
        yield* auth.approveUser(UserId.make("user-1"));
      }).pipe(
        Effect.provide(layer),
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error._tag).toBe("DbError");
          })
        )
      );
    });
  });

  describe("listApprovedUsers", () => {
    it.effect("returns approved users", () => {
      const users = [approvedUser, { ...approvedUser, id: "user-2" }];

      const layer = makeAuthClientLayer({
        listApprovedUsers: () => Effect.succeed(users),
      });

      return Effect.gen(function* () {
        const auth = yield* AuthClient;
        const result = yield* auth.listApprovedUsers();
        expect(result).toHaveLength(2);
        expect(result.every((u) => u.approved)).toBe(true);
      }).pipe(Effect.provide(layer));
    });

    it.effect("returns empty array when no approved users", () => {
      const layer = makeAuthClientLayer();

      return Effect.gen(function* () {
        const auth = yield* AuthClient;
        const result = yield* auth.listApprovedUsers();
        expect(result).toEqual([]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("propagates DbError", () => {
      const layer = makeAuthClientLayer({
        listApprovedUsers: () =>
          Effect.fail(new DbError({ cause: new Error("query failed") })),
      });

      return Effect.gen(function* () {
        const auth = yield* AuthClient;
        yield* auth.listApprovedUsers();
      }).pipe(
        Effect.provide(layer),
        Effect.flip,
        Effect.tap((error) =>
          Effect.sync(() => {
            expect(error._tag).toBe("DbError");
          })
        )
      );
    });
  });

  describe("combined workflow: approve user", () => {
    it.effect("find then approve flow succeeds", () => {
      const operations: string[] = [];

      const layer = makeAuthClientLayer({
        findUser: (userId) => {
          operations.push(`find:${userId}`);
          return Effect.succeed(mockUser);
        },
        approveUser: (userId) => {
          operations.push(`approve:${userId}`);
          return Effect.void;
        },
      });

      return Effect.gen(function* () {
        const auth = yield* AuthClient;
        const user = yield* auth.findUser(UserId.make("user-1"));
        if (user && !user.approved) {
          yield* auth.approveUser(UserId.make(user.id));
        }
        expect(operations).toEqual(["find:user-1", "approve:user-1"]);
      }).pipe(Effect.provide(layer));
    });

    it.effect("skips approve when user already approved", () => {
      const operations: string[] = [];

      const layer = makeAuthClientLayer({
        findUser: () => {
          operations.push("find");
          return Effect.succeed(approvedUser);
        },
        approveUser: () => {
          operations.push("approve");
          return Effect.void;
        },
      });

      return Effect.gen(function* () {
        const auth = yield* AuthClient;
        const user = yield* auth.findUser(UserId.make("user-1"));
        if (user && !user.approved) {
          yield* auth.approveUser(UserId.make(user.id));
        }
        expect(operations).toEqual(["find"]);
      }).pipe(Effect.provide(layer));
    });
  });
});
