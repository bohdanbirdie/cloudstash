import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";

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
    it("returns user when found", async () => {
      const layer = makeAuthClientLayer({
        findUser: (userId) =>
          userId === "user-1" ? Effect.succeed(mockUser) : Effect.succeed(null),
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthClient;
          return yield* auth.findUser(UserId.make("user-1"));
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(mockUser);
    });

    it("returns null when user not found", async () => {
      const layer = makeAuthClientLayer();

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthClient;
          return yield* auth.findUser(UserId.make("nonexistent"));
        }).pipe(Effect.provide(layer))
      );

      expect(result).toBeNull();
    });

    it("propagates DbError", async () => {
      const layer = makeAuthClientLayer({
        findUser: () =>
          Effect.fail(new DbError({ cause: new Error("query failed") })),
      });

      const error = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthClient;
          yield* auth.findUser(UserId.make("user-1"));
        }).pipe(Effect.provide(layer), Effect.flip)
      );

      expect(error._tag).toBe("DbError");
    });
  });

  describe("approveUser", () => {
    it("calls with correct userId", async () => {
      let capturedId: string | null = null;

      const layer = makeAuthClientLayer({
        approveUser: (userId) => {
          capturedId = userId;
          return Effect.void;
        },
      });

      await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthClient;
          yield* auth.approveUser(UserId.make("user-1"));
        }).pipe(Effect.provide(layer))
      );

      expect(capturedId).toBe("user-1");
    });

    it("propagates DbError", async () => {
      const layer = makeAuthClientLayer({
        approveUser: () =>
          Effect.fail(new DbError({ cause: new Error("update failed") })),
      });

      const error = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthClient;
          yield* auth.approveUser(UserId.make("user-1"));
        }).pipe(Effect.provide(layer), Effect.flip)
      );

      expect(error._tag).toBe("DbError");
    });
  });

  describe("listApprovedUsers", () => {
    it("returns approved users", async () => {
      const users = [approvedUser, { ...approvedUser, id: "user-2" }];

      const layer = makeAuthClientLayer({
        listApprovedUsers: () => Effect.succeed(users),
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthClient;
          return yield* auth.listApprovedUsers();
        }).pipe(Effect.provide(layer))
      );

      expect(result).toHaveLength(2);
      expect(result.every((u) => u.approved)).toBe(true);
    });

    it("returns empty array when no approved users", async () => {
      const layer = makeAuthClientLayer();

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthClient;
          return yield* auth.listApprovedUsers();
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual([]);
    });

    it("propagates DbError", async () => {
      const layer = makeAuthClientLayer({
        listApprovedUsers: () =>
          Effect.fail(new DbError({ cause: new Error("query failed") })),
      });

      const error = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthClient;
          yield* auth.listApprovedUsers();
        }).pipe(Effect.provide(layer), Effect.flip)
      );

      expect(error._tag).toBe("DbError");
    });
  });

  describe("combined workflow: approve user", () => {
    it("find then approve flow succeeds", async () => {
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

      await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthClient;
          const user = yield* auth.findUser(UserId.make("user-1"));
          if (user && !user.approved) {
            yield* auth.approveUser(UserId.make(user.id));
          }
        }).pipe(Effect.provide(layer))
      );

      expect(operations).toEqual(["find:user-1", "approve:user-1"]);
    });

    it("skips approve when user already approved", async () => {
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

      await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* AuthClient;
          const user = yield* auth.findUser(UserId.make("user-1"));
          if (user && !user.approved) {
            yield* auth.approveUser(UserId.make(user.id));
          }
        }).pipe(Effect.provide(layer))
      );

      expect(operations).toEqual(["find"]);
    });
  });
});
